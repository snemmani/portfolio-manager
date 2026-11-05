import {dirname} from 'node:path';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
export class MonitorError extends Error{constructor(message,{operation,code='MONITOR_ERROR',status,retryable=false}={}){super(message);Object.assign(this,{operation,code,status,retryable});}}
export function safeError(error,secrets=[]){let message=String(error?.message||error||'Unknown error');for(const s of secrets)if(s)message=message.split(s).join('[redacted]');return message.replace(/Bearer\s+\S+|sk-[\w-]+/g,'[redacted]').replace(/https?:\/\/[^\s]+/g,'[url]').slice(0,600);}
export class ControlClient{
 constructor({url='http://web:8787/api/market/tick',secret,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,log=()=>{}}){Object.assign(this,{url,secret,fetcher,sleep,now,log});}
 async call(operation,body={},options={}){
  const total=options.totalMs??120000,started=this.now(),requestBody=JSON.stringify({...body,version:2,operation});let attempt=0,last;
  while(this.now()-started<total){
   try{
    const timeout=Math.max(1,Math.min(options.timeoutMs??30000,total-(this.now()-started)));
    const response=await this.fetcher(this.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.secret},body:requestBody,signal:AbortSignal.timeout(timeout)});
    let data;try{data=await response.json()}catch{throw new MonitorError('Monitor API returned an unreadable response',{operation,status:response.status,retryable:response.ok||response.status>=500})}
    if(response.status===202&&data.pending){await this.sleep(Math.min(3000,Math.max(500,data.retryAfterMs||2000)));continue;}
    if(!response.ok)throw new MonitorError(data.error||'Monitor API request failed',{operation,status:response.status,code:data.code||'HTTP_'+response.status,retryable:[429,500,502,503,504].includes(response.status)});
    this.log({event:'operation_complete',operation,attempts:attempt+1,elapsedMs:this.now()-started});return data;
   }catch(error){
    const e=error instanceof MonitorError?error:new MonitorError(safeError(error,[this.secret]),{operation,code:error?.name==='TimeoutError'?'REQUEST_TIMEOUT':'NETWORK_ERROR',retryable:true});last=e;attempt++;
    this.log({event:'operation_error',operation,attempt,code:e.code,httpStatus:e.status,error:safeError(e,[this.secret]),elapsedMs:this.now()-started});
    if(!e.retryable||attempt>=(options.attempts??5))throw e;
    await this.sleep(Math.min(10000,1000*2**(attempt-1)));
   }
  }
  throw last||new MonitorError('Monitor operation exceeded its time budget',{operation,code:'OPERATION_TIMEOUT',retryable:true});
 }
}
export class Checkpoint{
 constructor(path){this.path=path;this.chain=Promise.resolve();this.value=null;}
 async load(){try{this.value=JSON.parse(await readFile(this.path,'utf8'));return this.value}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;return null}}
 async save(value){this.value=value;const serialized=JSON.stringify(value);this.chain=this.chain.catch(()=>{}).then(async()=>{await mkdir(dirname(this.path),{recursive:true,mode:0o700});const tmp=this.path+'.tmp';await writeFile(tmp,serialized,{mode:0o600});await rename(tmp,this.path);});await this.chain;}
}
export function startHeartbeat(client,identity,{log=()=>{},intervalMs=20000,now=Date.now}={}){
 let stopped=false,inflight=null,lastSuccess=now(),lost=null;
 const tick=()=>{if(stopped||inflight)return;inflight=client.call('heartbeat',identity,{timeoutMs:6000,totalMs:16000,attempts:2}).then(()=>{lastSuccess=now();lost=null}).catch(e=>{lost=e;log({event:'heartbeat_failed',reviewId:identity.reviewId,code:e.code,error:safeError(e)});}).finally(()=>{inflight=null;});};
 const timer=setInterval(tick,intervalMs);timer.unref?.();
 return {assert(){if(lost&&(!lost.retryable||now()-lastSuccess>90000))throw lost;},async stop(){stopped=true;clearInterval(timer);if(inflight)await inflight;},tick};
}

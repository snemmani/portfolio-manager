import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,chmod} from 'node:fs/promises';
import {hostname} from 'node:os';
import {fileURLToPath} from 'node:url';
import {newSubscriptionThread,verifySubscription,subscriptionEnvironment} from './subscription.mjs';
import {researchPrompt,OUTPUT_SCHEMA,validateRecommendations} from '../.runner-private/research-contract.mjs';
const root=new URL('../',import.meta.url),privateDir=new URL('.runner-private/',root),work=fileURLToPath(new URL('work/',privateDir));
const credentials=JSON.parse(await readFile(new URL('connection.json',privateDir),'utf8'));
const origin=new URL(credentials.siteUrl);if(origin.protocol!=='https:'||origin.pathname!=='/'||!origin.hostname.endsWith('.chatgpt.site'))throw Error('Invalid private Site origin');
const secretHeaders={'Content-Type':'application/json','Authorization':'Bearer '+credentials.sharedSecret,'OAI-Sites-Authorization':'Bearer '+credentials.siteBearer};
const args=new Set(process.argv.slice(2)),once=args.has('--once'),check=args.has('--check');
await mkdir(work,{recursive:true,mode:0o700});await chmod(privateDir,0o700);
let shutdown=false;const active=new AbortController();for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{shutdown=true;active.abort();});
const sleep=ms=>new Promise(resolve=>{const finish=()=>{clearTimeout(t);active.signal.removeEventListener('abort',finish);resolve()};const t=setTimeout(finish,ms);active.signal.addEventListener('abort',finish,{once:true});if(active.signal.aborted)finish();});
const safeError=e=>String(e?.message||e).replace(/(?:sk-[\w-]+|Bearer\s+\S+)/g,'[redacted]').slice(0,900);
async function call(payload){const r=await fetch(new URL('/api/runner',origin),{method:'POST',headers:secretHeaders,body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Dashboard runner endpoint HTTP '+r.status);return r.json();}
async function runJob(job){
 let stopped=false,heartbeatError=null;
 // The lease is renewed while Codex works. A network outage never authorizes
 // a second run; completion is retried with the same lease and report.
 const heartbeat=setInterval(()=>{if(!stopped)call({operation:'heartbeat',leaseToken:job.leaseToken}).catch(e=>{heartbeatError=safeError(e);});},30000);
 try{
 if(job.discoverySupported){
 console.log(new Date().toISOString()+' Screening NSE and US candidates with Jarvis criteria.');
 let discovery;
 try{const run=promisify(execFile);const child=run(fileURLToPath(new URL('.runner-runtime/python/bin/python',root)),[fileURLToPath(new URL('runner/discovery.py',root))],{env:subscriptionEnvironment(),timeout:270000,maxBuffer:5000000,signal:active.signal});
 child.child.stdin.end(JSON.stringify({exclude:job.snapshot.holdings.map(h=>h.ticker)}));const {stdout}=await child;discovery=JSON.parse(stdout);
 }catch{discovery={asOf:new Date().toISOString(),source:'Yahoo Finance via yfinance; Jarvis sector-aware screens',scope:'Live screen unavailable; no candidates invented',screens:[],candidates:[],errors:['Live new-stock discovery unavailable. Keep cash reserved and retry later.']};}
 const accepted=await call({operation:'discovery',leaseToken:job.leaseToken,discovery});job.snapshot=accepted.snapshot;
 console.log(new Date().toISOString()+` Discovery: ${job.snapshot.discovery.candidates.length} candidates; ${job.snapshot.discovery.errors.length} feed warnings.`);
 }
 const thread=newSubscriptionThread({model:job.model,workingDirectory:work});
 console.log(new Date().toISOString()+' Research started; authentication=chatgpt; provider=codex-subscription');
 const timeout=AbortSignal.timeout(9*60*1000),signal=AbortSignal.any([active.signal,timeout]);
 const turn=await thread.run(researchPrompt(job.snapshot),{outputSchema:OUTPUT_SCHEMA,signal});
 const result=validateRecommendations(JSON.parse(turn.finalResponse),job.snapshot);
 const payload={operation:'complete',leaseToken:job.leaseToken,result,usage:turn.usage,threadId:thread.id};let lastError;
 for(let attempt=0;attempt<4&&!shutdown;attempt++){try{const saved=await call(payload);console.log(new Date().toISOString()+` Published ${saved.positions} recommendations; snapshot=${saved.asOf}; API fallback=disabled`);return;}catch(e){lastError=e;await sleep((attempt+1)*5000);}}
 throw lastError||Error('Runner stopped before publishing');
 }catch(e){const error=shutdown?'Runner stopped; no API fallback was used.':safeError(e);console.error(new Date().toISOString()+' '+error);try{await call({operation:'fail',leaseToken:job.leaseToken,error});}catch{}if(once)process.exitCode=1;}
 finally{stopped=true;clearInterval(heartbeat);if(heartbeatError)console.error('Heartbeat check: '+heartbeatError);}
}
if(check){console.log('Authentication: '+verifySubscription()+'; API keys stripped; API fallback disabled.');process.exit(0);}
do{
 let auth='unavailable',error='';try{auth=verifySubscription();}catch(e){error=safeError(e);}
 try{const reply=await call({operation:'poll',auth,machine:hostname(),error});if(reply.job)await runJob(reply.job);else if(once)console.log('No pending job; '+(reply.reason||'runner is ready.'));}
 catch(e){console.error(new Date().toISOString()+' '+safeError(e));if(once)process.exitCode=1;}
 if(!once&&!shutdown)await sleep(30000);
}while(!once&&!shutdown);

import { dashboard } from './data';
import { snapshotForRunner,validateRecommendations,reportMarkdown } from './runner-contract';
type Env={DB:D1Database;RUNNER_SHARED_SECRET?:string;NOCODB_TOKEN?:string;CF_ACCESS_CLIENT_ID?:string;CF_ACCESS_CLIENT_SECRET?:string};
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const now=()=>new Date().toISOString();
const leaseMs=12*60*1000;
async function init(env:Env){const time=now();await env.DB.batch([
 env.DB.prepare('INSERT OR IGNORE INTO settings (id,model,encrypted_key,enabled,interval_minutes,updated_at) VALUES (?,?,?,?,?,?)').bind('owner','',null,1,60,time),
 env.DB.prepare('UPDATE settings SET encrypted_key=NULL WHERE encrypted_key IS NOT NULL'),
 env.DB.prepare('INSERT OR IGNORE INTO runner_state (id,status,updated_at) VALUES (?,?,?)').bind('local','offline',time)
]);}
async function config(env:Env){return env.DB.prepare('SELECT model,enabled,interval_minutes,updated_at FROM settings WHERE id=?').bind('owner').first<any>();}
async function state(env:Env){const row=await env.DB.prepare('SELECT * FROM runner_state WHERE id=?').bind('local').first<any>();return {...row,online:!!row?.heartbeat_at&&Date.now()-Date.parse(row.heartbeat_at)<120000,provider:'codex-subscription',apiCreditsUsed:false};}
async function getReport(env:Env){const r=await env.DB.prepare("SELECT status,body,error,as_of,model,updated_at,provider,recommendations_json FROM reports WHERE id='latest' AND provider='codex-subscription'").first<any>();if(!r)return null;const {recommendations_json,...report}=r;return {...report,recommendations:JSON.parse(recommendations_json||'[]')};}
async function jobState(env:Env){return env.DB.prepare("SELECT id,status,created_at,updated_at,error FROM research_jobs ORDER BY created_at DESC LIMIT 1").first<any>();}
async function expire(env:Env){await env.DB.prepare("UPDATE research_jobs SET status='failed',error='Runner lease expired; the machine may be offline. Queue a fresh report.',updated_at=? WHERE status='running' AND lease_until<?").bind(now(),now()).run();}
async function body(request:Request,max=250000){const raw=await request.text();if(raw.length>max)throw Error('Request too large');return JSON.parse(raw);}
function sameOrigin(r:Request){return r.headers.get('Origin')===new URL(r.url).origin;}
export async function settingsHandler(request:Request,env:Env){
 await init(env);
 if(request.method==='GET'){const c=await config(env);return json({model:c.model,enabled:!!c.enabled,intervalMinutes:c.interval_minutes,updatedAt:c.updated_at,provider:'codex-subscription',runner:await state(env)});}
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
 const b=await body(request,5000);if('apiKey' in b)return json({error:'API keys are not accepted. This site uses the local ChatGPT-authenticated Codex runner.'},400);
 const model=String(b.model||'').trim();if(model&&!/^[\w.:-]{1,100}$/.test(model))return json({error:'Enter a valid Codex model name or leave it blank for the default.'},400);
 const interval=Number(b.intervalMinutes);if(![30,60,240,1440].includes(interval))return json({error:'Invalid interval'},400);
 await env.DB.prepare('UPDATE settings SET model=?,enabled=?,interval_minutes=?,encrypted_key=NULL,updated_at=? WHERE id=?').bind(model,b.enabled?1:0,interval,now(),'owner').run();
 return json({ok:true,message:'Saved. Research uses the local Codex ChatGPT session; API billing is disabled.'});
}
async function queue(env:Env,automatic=false){
 await expire(env);const c=await config(env);
 if(automatic&&!c.enabled)return {queued:false,reason:'paused'};
 const time=now();
 // The singleton queue row is also a cross-tab/cross-runner lock. Completion keeps
 // updated_at for throttling; no duplicate paid or subscription work is launched.
 await env.DB.prepare("INSERT OR IGNORE INTO research_jobs (id,status,model,created_at,updated_at) VALUES ('current','idle','',?,?)").bind(time,time).run();
 const cutoff=new Date(Date.now()-(automatic?c.interval_minutes*60000:60000)).toISOString();
 const lock=await env.DB.prepare("UPDATE research_jobs SET status='queued',model=?,input_json=NULL,result_json=NULL,error=NULL,lease_token=NULL,lease_until=NULL,created_at=?,updated_at=? WHERE id='current' AND status NOT IN ('queued','running') AND (status='idle' OR updated_at<=?)").bind(c.model,time,time,cutoff).run();
 return {queued:!!lock.meta.changes,reason:lock.meta.changes?'queued':'already active or throttled'};
}
export async function analysisHandler(request:Request,env:Env){
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method==='POST'&&!sameOrigin(request))return json({error:'Invalid request origin'},403);
 await init(env);await expire(env);let queued;
 if(request.method==='POST')queued=await queue(env);
 const c=await config(env);const runner=await state(env);const report=await getReport(env);const age=report?Date.now()-Date.parse(report.as_of):null;
 return json({enabled:!!c.enabled,provider:'codex-subscription',intervalMinutes:c.interval_minutes,runner,report,job:await jobState(env),reportStale:age!==null&&age>c.interval_minutes*60000,...(queued?{message:queued.queued?'Research queued. The local runner will pick it up shortly.':'A report is already queued, running or was just refreshed.'}:{})});
}
async function authenticate(request:Request,env:Env){
 const expected=env.RUNNER_SHARED_SECRET;const auth=request.headers.get('Authorization')||'';
 if(!expected||!auth.startsWith('Bearer '))return false;
 const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const a=await hash(auth.slice(7)),b=await hash(expected);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export async function runnerHandler(request:Request,env:Env){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!await authenticate(request,env))return json({error:'Unauthorized runner'},401);
 await init(env);const b=await body(request);const time=now();
 const safeError=(s:any)=>String(s||'').replace(/(?:sk-[\w-]+|Bearer\s+\S+)/g,'[redacted]').slice(0,1000);
 if(b.operation==='poll'){
 const auth=b.auth==='chatgpt'?'chatgpt':'unavailable';const status=auth==='chatgpt'?'ready':'auth_required';
 await env.DB.prepare('UPDATE runner_state SET heartbeat_at=?,status=?,auth_mode=?,machine=?,last_error=?,updated_at=? WHERE id=?').bind(time,status,auth,String(b.machine||'Local machine').slice(0,100),safeError(b.error)||null,time,'local').run();
 await expire(env);const c=await config(env);if(auth!=='chatgpt')return json({job:null,settings:c,reason:'ChatGPT authentication required. No API fallback.'});
 await queue(env,true);
 const token=crypto.randomUUID(),until=new Date(Date.now()+leaseMs).toISOString();
 const lock=await env.DB.prepare("UPDATE research_jobs SET status='running',lease_token=?,lease_until=?,updated_at=? WHERE id='current' AND status='queued'").bind(token,until,time).run();
 if(!lock.meta.changes)return json({job:null,settings:c});
 try{const snap=snapshotForRunner(await dashboard(env));
 await env.DB.prepare("UPDATE research_jobs SET input_json=?,snapshot_at=?,updated_at=? WHERE id='current' AND lease_token=? AND status='running'").bind(JSON.stringify(snap),snap.asOf,time,token).run();
 const claimed=await env.DB.prepare("SELECT model FROM research_jobs WHERE id='current' AND lease_token=?").bind(token).first<any>();
 return json({job:{id:'current',leaseToken:token,model:claimed?.model||'',snapshot:snap},settings:c});
 }catch{await env.DB.prepare("UPDATE research_jobs SET status='failed',error='Portfolio snapshot unavailable. Retry when market and NocoDB feeds recover.',updated_at=? WHERE id='current' AND lease_token=?").bind(time,token).run();return json({error:'Portfolio snapshot unavailable'},502);}
 }
 if(b.operation==='heartbeat'){
 const r=await env.DB.prepare("UPDATE research_jobs SET lease_until=?,updated_at=? WHERE id='current' AND status='running' AND lease_token=? AND lease_until>=?").bind(new Date(Date.now()+leaseMs).toISOString(),time,b.leaseToken||'',time).run();
 if(!r.meta.changes)return json({error:'Lease expired or replaced'},409);
 await env.DB.prepare("UPDATE runner_state SET heartbeat_at=?,status='researching',updated_at=? WHERE id='local'").bind(time,time).run();return json({ok:true});
 }
 if(['complete','fail'].includes(b.operation)){
 const job=await env.DB.prepare("SELECT * FROM research_jobs WHERE id='current' AND lease_token=?").bind(b.leaseToken||'').first<any>();
 if(b.operation==='complete'&&job?.status==='completed'){const saved=await getReport(env);return json({ok:true,positions:saved?.recommendations?.length||0,asOf:job.snapshot_at,alreadySaved:true});}
 if(!job||job.status!=='running'||job.lease_until<time)return json({error:'Lease expired or replaced'},409);
 if(b.operation==='fail'){
 await env.DB.prepare("UPDATE research_jobs SET status='failed',error=?,updated_at=? WHERE id='current' AND lease_token=?").bind(safeError(b.error)||'Codex research failed. No API fallback was used.',time,b.leaseToken).run();
 await env.DB.prepare("UPDATE runner_state SET heartbeat_at=?,status='error',last_error=?,updated_at=? WHERE id='local'").bind(time,safeError(b.error),time).run();return json({ok:true});
 }
 let result;try{result=validateRecommendations(b.result,JSON.parse(job.input_json));}catch{return json({error:'Invalid recommendation output'},400);}
 const model=job.model||'Codex default';
 await env.DB.batch([
 env.DB.prepare("INSERT INTO reports (id,status,body,error,as_of,model,updated_at,provider,recommendations_json) VALUES ('latest','completed',?,NULL,?,?,?,'codex-subscription',?) ON CONFLICT(id) DO UPDATE SET status='completed',body=excluded.body,error=NULL,as_of=excluded.as_of,model=excluded.model,updated_at=excluded.updated_at,provider='codex-subscription',recommendations_json=excluded.recommendations_json,response_id=NULL").bind(reportMarkdown(result),job.snapshot_at,model,time,JSON.stringify(result.recommendations)),
 env.DB.prepare("UPDATE research_jobs SET status='completed',result_json=?,updated_at=? WHERE id='current' AND lease_token=?").bind(JSON.stringify({usage:b.usage||null,threadId:String(b.threadId||'').slice(0,100)}),time,b.leaseToken),
 env.DB.prepare("UPDATE runner_state SET heartbeat_at=?,status='ready',auth_mode='chatgpt',last_error=NULL,last_completed_at=?,updated_at=? WHERE id='local'").bind(time,time,time)
 ]);return json({ok:true,positions:result.recommendations.length,asOf:job.snapshot_at});
 }
 return json({error:'Unknown operation'},400);
}

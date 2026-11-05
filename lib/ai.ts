import {enableCampaign,nextCampaign,prepareCampaign,finishCampaign,campaignsStatus} from './research-campaigns';
import {researchStatus,runClaimed,writeResearchProgress,terminalRun,safeResearchError} from './research-progress';
import {annualDocumentIndex,currentAnnualDocuments,documentEvidence,documentRequest,DOCUMENT_POLICY} from './annual-documents';
import {fundamentalReviews,fundamentalScope} from './fundamental-store';
import {FUNDAMENTAL_POLICY} from './fundamental-policy';
import {publicSourceUrl,validateFundamentals} from './fundamental-contract';
import {storedDiscovery,researchDiscovery} from './discovery-store';
import {rulesMode,liveMarket,marketState} from './market-store';
import {recheckCandidate} from './discovery-review';
import {researchSlot,researchSchedule} from './research-schedule';
import { validateDiscovery } from './discovery';
import { quote } from './data';
import { dashboard } from './data';
import { snapshotForRunner,validateRecommendations,reportMarkdown,mergeSavedRecommendations } from './runner-contract';
type Env={DB:D1Database;RUNNER_SHARED_SECRET?:string;NOCODB_TOKEN?:string;CF_ACCESS_CLIENT_ID?:string;CF_ACCESS_CLIENT_SECRET?:string};
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const now=()=>new Date().toISOString();
const leaseMs=12*60*1000;
async function init(env:Env){const time=now();await env.DB.batch([
 env.DB.prepare('INSERT OR IGNORE INTO settings (id,model,encrypted_key,enabled,interval_minutes,updated_at) VALUES (?,?,?,?,?,?)').bind('owner','',null,1,120,time),
 env.DB.prepare('UPDATE settings SET encrypted_key=NULL WHERE encrypted_key IS NOT NULL'),
 env.DB.prepare('INSERT OR IGNORE INTO runner_state (id,status,updated_at) VALUES (?,?,?)').bind('local','offline',time)
]);}
async function config(env:Env){return env.DB.prepare('SELECT model,enabled,interval_minutes,updated_at FROM settings WHERE id=?').bind('owner').first<any>();}
async function state(env:Env){const row=await env.DB.prepare('SELECT * FROM runner_state WHERE id=?').bind('local').first<any>();return {...row,online:!!row?.heartbeat_at&&Date.now()-Date.parse(row.heartbeat_at)<120000,provider:'antigravity',apiCreditsUsed:false};}
async function getReport(env:Env){const r=await env.DB.prepare("SELECT status,body,error,as_of,model,updated_at,provider,recommendations_json,discovery_json,new_stock_ideas_json FROM reports WHERE id='latest' AND provider IN ('antigravity','codex-subscription')").first<any>();if(!r)return null;const {recommendations_json,discovery_json,new_stock_ideas_json,...report}=r;return {...report,recommendations:JSON.parse(recommendations_json||'[]'),discovery:JSON.parse(discovery_json||'null'),newStockIdeas:JSON.parse(new_stock_ideas_json||'[]')};}
async function jobState(env:Env){return env.DB.prepare("SELECT id,status,created_at,updated_at,error,request_source,last_auto_slot FROM research_jobs ORDER BY created_at DESC LIMIT 1").first<any>();}
async function expire(env:Env){const time=now();await env.DB.batch([env.DB.prepare("UPDATE research_jobs SET status='failed',error='Runner lease expired; the machine may be offline. Queue a fresh report.',updated_at=? WHERE status='running' AND lease_until<?").bind(time,time),env.DB.prepare("UPDATE research_runs SET status='failed',phase='failed',error='Runner lease expired; queue a fresh review.',finished_at=?,updated_at=? WHERE status='running' AND id=(SELECT run_id FROM research_jobs WHERE status='failed' AND error LIKE 'Runner lease expired%')").bind(time,time)]);}
async function body(request:Request,max=1000000){const raw=await request.text();if(raw.length>max)throw Error('Request too large');return JSON.parse(raw);}
function sameOrigin(r:Request){return r.headers.get('Origin')===new URL(r.url).origin;}
export async function settingsHandler(request:Request,env:Env){
 await init(env);
 if(request.method==='GET'){const c=await config(env);const job=await jobState(env);return json({schedule:researchSchedule(!!c.enabled,job?.last_auto_slot),model:c.model,enabled:!!c.enabled,intervalMinutes:120,updatedAt:c.updated_at,provider:'antigravity',runner:await state(env)});}
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
 const b=await body(request,5000);if('apiKey' in b)return json({error:'API keys are not accepted. This site uses the local Antigravity account runner.'},400);
 const model=String(b.model||'').trim();if(model&&!/^[\w.:-]{1,100}$/.test(model))return json({error:'Enter a valid Antigravity model name or leave it blank for the default.'},400);
 const interval=120;
 await env.DB.prepare('UPDATE settings SET model=?,enabled=?,interval_minutes=?,encrypted_key=NULL,updated_at=? WHERE id=?').bind(model,b.enabled?1:0,interval,now(),'owner').run();
 return json({ok:true,message:'Saved. Research uses the local Antigravity account session; API billing is disabled.'});
}
async function queue(env:Env,automatic=false,focusTicker='',requestContext:any=null){
 await expire(env);const c=await config(env);
 if(automatic&&!c.enabled)return {queued:false,reason:'paused'};
 const slot=researchSlot();if(automatic&&!slot)return {queued:false,reason:'outside Indian business hours; on demand only'};
 if(automatic&&!requestContext){const campaign=await nextCampaign(env);if(campaign)requestContext={intent:'deploy-cash',portfolio:campaign.portfolio,market:campaign.market,campaignId:campaign.id};}
 const time=now();
 // The singleton queue row is also a cross-tab/cross-runner lock. Completion keeps
 // updated_at for throttling; no duplicate paid or subscription work is launched.
 await env.DB.prepare("INSERT OR IGNORE INTO research_jobs (id,status,model,created_at,updated_at) VALUES ('current','idle','',?,?)").bind(time,time).run();
 const cutoff=new Date(Date.now()-60000).toISOString();
 const runId=crypto.randomUUID();
 const locks=await env.DB.batch([env.DB.prepare("UPDATE research_jobs SET run_id=?,status='queued',model=?,request_source=?,focus_ticker=?,last_auto_slot=CASE WHEN ? THEN ? ELSE last_auto_slot END,input_json=?,result_json=NULL,error=NULL,lease_token=NULL,lease_until=NULL,created_at=?,updated_at=? WHERE id='current' AND status NOT IN ('queued','running') AND (status='idle' OR updated_at<=?) AND (?=0 OR last_auto_slot IS NULL OR last_auto_slot<>?)").bind(runId,c.model,automatic?'automatic':'manual',focusTicker||null,automatic?1:0,slot,requestContext?JSON.stringify({requestedResearch:requestContext}):null,time,time,cutoff,automatic?1:0,slot),env.DB.prepare("INSERT INTO research_runs(id,status,phase,request_source,focus_ticker,created_at,updated_at,events_json) SELECT run_id,'queued','queued',request_source,focus_ticker,created_at,updated_at,? FROM research_jobs WHERE run_id=?").bind(JSON.stringify([{phase:'queued',at:time}]),runId)]);const lock=locks[0];
 return {queued:!!lock.meta.changes,reason:lock.meta.changes?'queued':'already active or throttled'};
}
export async function analysisHandler(request:Request,env:Env){
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method==='POST'&&!sameOrigin(request))return json({error:'Invalid request origin'},403);
 await init(env);await expire(env);let queued;
 if(request.method==='POST'){const input=await body(request,5000),focus=String(input.ticker||'').toUpperCase();if(focus&&!/^[A-Z0-9.&-]{1,25}(\.NS|\.BO)?$/.test(focus))return json({error:'Invalid company ticker'},400);const documents=await annualDocumentIndex(env);if(documents.enabled&&!documents.available)return json({error:'The report library is offline. Retry when it returns.'},503);if(focus&&documents.reports.some((d:any)=>d.ticker===focus&&d.status==='processing'))return json({error:'The PDF is still being prepared. Wait for processing to finish before requesting research.'},409);let context=null;if(input.intent==='deploy-cash'){if(focus||!['India','US'].includes(input.market)||typeof input.portfolio!=='string'||input.portfolio.length>100||input.budget!==undefined&&(!Number.isFinite(input.budget)||input.budget<=0))return json({error:'Choose a portfolio, market and positive available budget.'},400);const portfolio= (await dashboard(env)).portfolios.find((p:any)=>p.name===input.portfolio);if(!portfolio||!portfolio.complete||portfolio.cash<=0)return json({error:'This portfolio has no verified available cash.'},400);context={intent:'deploy-cash',portfolio:portfolio.name,market:input.market,budget:Math.min(portfolio.cash,input.budget??portfolio.cash),campaignId:await enableCampaign(env,portfolio.name,input.market)};}queued=await queue(env,false,focus,context);}
 if(request.method==='GET'&&new URL(request.url).searchParams.get('compact')==='1'){const report=await env.DB.prepare("SELECT as_of,updated_at,recommendations_json FROM reports WHERE id='latest' AND provider IN ('antigravity','codex-subscription')").first<any>();return json({report:report?{as_of:report.as_of,updated_at:report.updated_at,recommendations:JSON.parse(report.recommendations_json||'[]')}:null});}
 const c=await config(env);const runner=await state(env);const report=await getReport(env);const age=report?Date.now()-Date.parse(report.as_of):null;
 const currentJob=await jobState(env);
 return json({schedule:researchSchedule(!!c.enabled,currentJob?.last_auto_slot),enabled:!!c.enabled,provider:'antigravity',intervalMinutes:120,runner,report,job:currentJob,fundamentalReviews:await fundamentalReviews(env),reportStale:age!==null&&age>7200000,...(queued?{message:queued.queued?'Research queued. The local runner will pick it up shortly.':'A report is already queued, running or was just refreshed.'}:{})});
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
 const auth=b.auth==='antigravity'?'antigravity':'unavailable';const status=auth==='antigravity'?'ready':'auth_required';
 await env.DB.prepare('UPDATE runner_state SET heartbeat_at=?,status=?,auth_mode=?,machine=?,last_error=?,updated_at=? WHERE id=?').bind(time,status,auth,String(b.machine||'Local machine').slice(0,100),safeError(b.error)||null,time,'local').run();
 await expire(env);const c=await config(env);if(auth!=='antigravity')return json({job:null,settings:c,reason:'Antigravity account login required. No API fallback.'});
 // Expire automatic work that was queued in a previous slot; manual requests
 // remain eligible around the clock, including when automatic research is paused.
 await env.DB.batch([env.DB.prepare("UPDATE research_jobs SET status='failed',error='Automatic research window ended; use Queue research now for an on-demand report.',updated_at=? WHERE status='queued' AND request_source='automatic' AND (?=0 OR last_auto_slot<>?)").bind(time,c.enabled&&researchSlot()?1:0,researchSlot()||''),env.DB.prepare("UPDATE research_runs SET status='failed',phase='failed',error='The scheduled research window ended before this review started.',finished_at=?,updated_at=? WHERE status='queued' AND id=(SELECT run_id FROM research_jobs WHERE status='failed' AND error LIKE 'Automatic research window ended%')").bind(time,time)]);
 await queue(env,true);
 const token=crypto.randomUUID(),until=new Date(Date.now()+leaseMs).toISOString();
 const lock=await env.DB.prepare("UPDATE research_jobs SET status='running',lease_token=?,lease_until=?,updated_at=? WHERE id='current' AND status='queued'").bind(token,until,time).run();
 if(!lock.meta.changes)return json({job:null,settings:c});
 await runClaimed(env,token);
 try{const snap=snapshotForRunner(await dashboard(env));if(rulesMode(env)){const market=await marketState(env);(snap as any).events=JSON.parse(market?.events_json||'{}');const saved=await storedDiscovery(env);(snap as any).discovery=researchDiscovery(saved?{...saved,candidates:saved.candidates.filter((c:any)=>!snap.holdings.some((h:any)=>h.ticker===c.ticker))}:null);const reviews=await fundamentalReviews(env),documents=await annualDocumentIndex(env);if(documents.enabled&&!documents.available)throw Error('DOCUMENT_SERVICE_UNAVAILABLE');const uploaded=[...new Set<string>(documents.reports.map((d:any)=>d.ticker))].flatMap(ticker=>currentAnnualDocuments(documents.reports,ticker));const queued=await env.DB.prepare("SELECT focus_ticker,input_json,run_id,request_source FROM research_jobs WHERE id='current'").first<any>();(snap as any).requestedResearch=JSON.parse(queued?.input_json||'{}').requestedResearch||null;if((snap as any).requestedResearch?.campaignId){(snap as any).requestedResearch=await prepareCampaign(env,snap,saved,reviews,uploaded,(snap as any).requestedResearch,true,queued?.run_id);if(queued?.request_source==='automatic'&&!(snap as any).requestedResearch.tickers.length)(snap as any).requestedResearch=null;}(snap as any).fundamentalPolicy=FUNDAMENTAL_POLICY;(snap as any).fundamentalScope=fundamentalScope(snap,saved,reviews,queued?.focus_ticker||'',queued?.focus_ticker?1:2,uploaded,(snap as any).requestedResearch||{});const scopeTickers=new Set((snap as any).fundamentalScope.map((c:any)=>c.ticker));(snap as any).discovery={...((snap as any).discovery||{}),candidates:(saved?.candidates||[]).filter((c:any)=>scopeTickers.has(c.ticker))};const manifest=uploaded.filter((d:any)=>scopeTickers.has(d.ticker)).slice(0,12);(snap as any).annualDocumentManifest=manifest;(snap as any).annualDocumentEvidence=await documentEvidence(env,manifest.map((d:any)=>d.id));const relevant=new Set([...snap.holdings.map((h:any)=>h.ticker),...((snap as any).discovery?.candidates||[]).map((c:any)=>c.ticker),...(snap as any).fundamentalScope.map((c:any)=>c.ticker)]);(snap as any).fundamentalReviews=Object.fromEntries(Object.entries(reviews).filter(([ticker])=>relevant.has(ticker)));(snap as any).fundamentalProfiles={};}
 if(rulesMode(env)&&!(snap as any).fundamentalScope?.length){await env.DB.batch([terminalRun(env,'completed',time,token,null,{assessed:0,supported:0,withWarnings:0,needsAttention:0}),env.DB.prepare("UPDATE research_jobs SET status='completed',updated_at=? WHERE id='current' AND lease_token=?").bind(time,token)]);return json({job:null,settings:c,reason:'No affordable companies need a fresh investment review in this selection.'});}
 await env.DB.prepare("UPDATE research_jobs SET input_json=?,snapshot_at=?,updated_at=? WHERE id='current' AND lease_token=? AND status='running'").bind(JSON.stringify(snap),snap.asOf,time,token).run();
 const claimed=await env.DB.prepare("SELECT model FROM research_jobs WHERE id='current' AND lease_token=?").bind(token).first<any>();
 await runClaimed(env,token,((snap as any).fundamentalScope||[]).map((c:any)=>c.ticker));
 return json({job:{id:'current',leaseToken:token,model:claimed?.model||'',snapshot:snap,discoverySupported:!rulesMode(env)},settings:c});
 }catch{await terminalRun(env,'failed',time,token,'Portfolio snapshot unavailable.').run();await env.DB.prepare("UPDATE research_jobs SET status='failed',error='Portfolio snapshot unavailable. Retry when market and NocoDB feeds recover.',updated_at=? WHERE id='current' AND lease_token=?").bind(time,token).run();return json({error:'Portfolio snapshot unavailable'},502);}
 }
 if(b.operation==='heartbeat'){
 const r=await env.DB.prepare("UPDATE research_jobs SET lease_until=?,updated_at=? WHERE id='current' AND status='running' AND lease_token=? AND lease_until>=?").bind(new Date(Date.now()+leaseMs).toISOString(),time,b.leaseToken||'',time).run();
 if(!r.meta.changes)return json({error:'Lease expired or replaced'},409);
 await env.DB.prepare("UPDATE research_runs SET heartbeat_at=? WHERE id=(SELECT run_id FROM research_jobs WHERE lease_token=?) AND status='running'").bind(time,b.leaseToken).run();
 await env.DB.prepare("UPDATE runner_state SET heartbeat_at=?,status='researching',updated_at=? WHERE id='local'").bind(time,time).run();return json({ok:true});
 }
 if(b.operation==='progress'){const result=await writeResearchProgress(env,b.leaseToken||'',b.progress||{});return json(result,result.status||200);}
 if(b.operation==='document_summaries'){
 const job=await env.DB.prepare("SELECT input_json FROM research_jobs WHERE id='current' AND status='running' AND lease_token=? AND lease_until>=?").bind(b.leaseToken||'',time).first<any>();if(!job)return json({error:'Lease expired or replaced'},409);const snap=JSON.parse(job.input_json),manifest=snap.annualDocumentManifest||[];
 if(!Array.isArray(b.summaries)||b.summaries.length>12||b.summaries.some((s:any)=>!manifest.some((d:any)=>d.id===s.reportId&&d.sha256===s.sha256&&d.ticker===s.ticker&&d.period===s.period)))return json({error:'The summary is outside the captured report scope or its file has changed.'},400);
 const companies=Object.fromEntries(Object.entries(snap.fundamentalProfiles||{}).map(([ticker,p]:any)=>[ticker,p.name]));const response=await documentRequest(env,'/v1/summaries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({summaries:b.summaries,companies})});if(!response.ok)return json({error:'Uploaded summary validation could not finish.'},503);const checks=await response.json();
 snap.annualDocumentEvidence=await documentEvidence(env,manifest.map((d:any)=>d.id));snap.annualDocumentManifest=snap.annualDocumentEvidence.map(({summary,summaryAttempt,...meta}:any)=>meta);await env.DB.prepare("UPDATE research_jobs SET input_json=?,updated_at=? WHERE id='current' AND status='running' AND lease_token=?").bind(JSON.stringify(snap),time,b.leaseToken).run();return json({ok:true,snapshot:snap,checks});
 }
 if(b.operation==='fundamental_profiles'){
 const job=await env.DB.prepare("SELECT input_json FROM research_jobs WHERE id='current' AND status='running' AND lease_token=? AND lease_until>=?").bind(b.leaseToken||'',time).first<any>();if(!job)return json({error:'Lease expired or replaced'},409);
 const snap=JSON.parse(job.input_json),scope=new Set((snap.fundamentalScope||[]).map((s:any)=>s.ticker));if(!Array.isArray(b.profiles)||b.profiles.length>4)return json({error:'Invalid company profiles'},400);
 snap.fundamentalProfiles=Object.fromEntries(b.profiles.filter((p:any)=>scope.has(p.ticker)&&typeof p.name==='string').map((p:any)=>[p.ticker,{name:p.name.slice(0,200),website:publicSourceUrl(p.website)?.href||null}]));
 await env.DB.prepare("UPDATE research_jobs SET input_json=?,updated_at=? WHERE id='current' AND lease_token=? AND status='running'").bind(JSON.stringify(snap),time,b.leaseToken).run();return json({ok:true,snapshot:snap});
 }
 if(b.operation==='discovery'){
 const job=await env.DB.prepare("SELECT input_json FROM research_jobs WHERE id='current' AND status='running' AND lease_token=? AND lease_until>=?").bind(b.leaseToken||'',time).first<any>();
 if(!job)return json({error:'Lease expired or replaced'},409);
 try{const snap=JSON.parse(job.input_json);snap.discovery=validateDiscovery(b.discovery,snap);await env.DB.prepare("UPDATE research_jobs SET input_json=?,updated_at=? WHERE id='current' AND lease_token=? AND status='running'").bind(JSON.stringify(snap),time,b.leaseToken).run();return json({ok:true,snapshot:snap});}catch{return json({error:'Invalid discovery evidence'},400);}
 }
 if(['complete','fail'].includes(b.operation)){
 const job=await env.DB.prepare("SELECT * FROM research_jobs WHERE id='current' AND lease_token=?").bind(b.leaseToken||'').first<any>();
 if(b.operation==='complete'&&job?.status==='completed'){const saved=await getReport(env);return json({ok:true,positions:saved?.recommendations?.length||0,asOf:job.snapshot_at,alreadySaved:true});}
 if(!job||job.status!=='running'||job.lease_until<time)return json({error:'Lease expired or replaced'},409);
 if(b.operation==='fail'){
 const failedSnapshot=JSON.parse(job.input_json||'{}');await finishCampaign(env,failedSnapshot,[],safeError(b.error)||'Research failed.');const missed=validateFundamentals([],failedSnapshot);for(const r of missed){r.summary='Company research did not finish; the investment case is unverified.';r.gaps=['The research attempt failed or exceeded its time limit. No investment case was established.'];await env.DB.prepare("INSERT INTO fundamental_reviews(ticker,data_json,researched_at) VALUES(?,?,?) ON CONFLICT(ticker) DO NOTHING").bind(r.ticker,JSON.stringify(r),r.researchedAt).run();}
 await env.DB.batch([env.DB.prepare("UPDATE research_jobs SET status='failed',error=?,updated_at=? WHERE id='current' AND lease_token=?").bind(safeError(b.error)||'Antigravity research failed. No API fallback was used.',time,b.leaseToken),terminalRun(env,'failed',time,b.leaseToken,safeResearchError(b.error))]);
 await env.DB.prepare("UPDATE runner_state SET heartbeat_at=?,status='error',last_error=?,updated_at=? WHERE id='local'").bind(time,safeError(b.error),time).run();return json({ok:true});
 }
 let result;try{result=validateRecommendations(b.result,JSON.parse(job.input_json),Array.isArray(b.sourceChecks)?b.sourceChecks:[]);}catch{return json({error:'Invalid recommendation output'},400);}
 const captured=JSON.parse(job.input_json),prior=await getReport(env);result.recommendations=mergeSavedRecommendations(prior?.recommendations||[],result.recommendations,captured.holdings,captured.fundamentalScope);
 await finishCampaign(env,captured,result.fundamental_reviews);
 const model=job.model||'Antigravity default';
 await env.DB.batch([
 terminalRun(env,'completed',time,b.leaseToken,null,{assessed:result.fundamental_reviews.length,supported:result.fundamental_reviews.filter((r:any)=>r.decision==='supported').length,withWarnings:result.fundamental_reviews.filter((r:any)=>r.decision==='supported'&&r.warnings?.length).length,needsAttention:result.fundamental_reviews.filter((r:any)=>r.decision!=='supported').length}),
 ...(result.fundamental_reviews||[]).map((r:any)=>env.DB.prepare('INSERT INTO fundamental_reviews(ticker,data_json,researched_at) VALUES(?,?,?) ON CONFLICT(ticker) DO UPDATE SET data_json=excluded.data_json,researched_at=excluded.researched_at').bind(r.ticker,JSON.stringify(r),r.researchedAt)),
 env.DB.prepare("INSERT INTO reports (id,status,body,error,as_of,model,updated_at,provider,recommendations_json,discovery_json,new_stock_ideas_json) VALUES ('latest','completed',?,NULL,?,?,?,'antigravity',?,?,?) ON CONFLICT(id) DO UPDATE SET status='completed',body=excluded.body,error=NULL,as_of=excluded.as_of,model=excluded.model,updated_at=excluded.updated_at,provider='antigravity',recommendations_json=excluded.recommendations_json,discovery_json=excluded.discovery_json,new_stock_ideas_json=excluded.new_stock_ideas_json,response_id=NULL").bind(reportMarkdown(result),job.snapshot_at,model,time,JSON.stringify(result.recommendations),JSON.stringify(JSON.parse(job.input_json).discovery||null),JSON.stringify(result.new_stock_ideas||[])),
 env.DB.prepare("UPDATE research_jobs SET status='completed',result_json=?,updated_at=? WHERE id='current' AND lease_token=?").bind(JSON.stringify({usage:b.usage||null,threadId:String(b.threadId||'').slice(0,100)}),time,b.leaseToken),
 env.DB.prepare("UPDATE runner_state SET heartbeat_at=?,status='ready',auth_mode='antigravity',last_error=NULL,last_completed_at=?,updated_at=? WHERE id='local'").bind(time,time,time),
 ...(rulesMode(env)?[env.DB.prepare("UPDATE market_state SET requested=1 WHERE id='local'")]:[]),
 ...(job.request_source==='automatic'&&!rulesMode(env)?[env.DB.prepare("INSERT OR IGNORE INTO buy_review_runs(id,as_of,completed_at,status) VALUES(?,?,?,'pending')").bind(job.lease_token,job.snapshot_at,time)]:[])
 ]);return json({ok:true,positions:result.recommendations.length,asOf:job.snapshot_at});
 }
 return json({error:'Unknown operation'},400);
}

export async function discoveryHandler(request:Request,env:Env){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const report=await getReport(env);if(rulesMode(env)){const snap=await dashboard(env);const name=new URL(request.url).searchParams.get('portfolio');const selected=name==='All portfolios'?[]:name?snap.portfolios.filter((p:any)=>p.name===name):snap.portfolios;if(name&&name!=='All portfolios'&&!selected.length)return json({error:'Unknown portfolio'},400);const market=await liveMarket(env,selected,report?.discovery,snap);return json({...market,holdingRecommendations:report?.recommendations||[],reportAsOf:report?.as_of||null});}const discovery=report?.discovery;
 if(!discovery)return json({discovery:null,ideas:[],message:'Queue research to screen new stocks.'});
 const candidates=await Promise.all(discovery.candidates.map(async(c:any)=>{const q=await quote(c.ticker);return recheckCandidate({...c,researchPrice:c.price,price:q.price,quoteTime:q.time,stale:q.stale||q.currency!==c.currency});}));
 const fxQuote=await quote('USDINR=X');const fx=fxQuote.price&&!fxQuote.stale?fxQuote.price:null;
 return json({discovery:{...discovery,candidates,fx},ideas:report.newStockIdeas||[],holdingRecommendations:report.recommendations||[],reportAsOf:report.as_of});
}

export async function researchStatusHandler(request:Request,env:any){if(request.method!=='GET')return json({error:'Method not allowed'},405);return json(await researchStatus(env));}

export async function researchCampaignsHandler(request:Request,env:any){
 if(request.method==='GET')return json({campaigns:await campaignsStatus(env)});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
 const b=await body(request,5000);if(typeof b.portfolio!=='string'||b.portfolio.length>100||!['India','US'].includes(b.market))return json({error:'Choose a portfolio and market.'},400);
 const [snap,discovery,reviews,documents]=await Promise.all([dashboard(env),storedDiscovery(env),fundamentalReviews(env),annualDocumentIndex(env)]);const p=snap.portfolios.find((p:any)=>p.name===b.portfolio);if(!p||!p.complete||p.cash<=0)return json({error:'Verified available cash is required.'},400);if(!documents.available)return json({error:'The report library is offline.'},503);
 const id=await enableCampaign(env,p.name,b.market);await prepareCampaign(env,snap,discovery,reviews,documents.reports,{intent:'deploy-cash',portfolio:p.name,market:b.market,campaignId:id});return json({ok:true,campaigns:await campaignsStatus(env),message:'Automatic cash research enabled. The next scheduled review will take the next two pending candidates.'});
}

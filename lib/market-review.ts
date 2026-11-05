import {annualDocumentIndex} from './annual-documents';
import {fundamentalCheck} from './fundamental-policy';
import {dashboard,invalidateDashboard,records} from './data';
import {loadExecutionContext} from './execution';
import {withDataBudget} from './data-budget';
import {pack,unpack,compactSnapshot,revision,ledgerRows} from './review-values';
import {marketState} from './market-store';
import {marketTargets,newsTargets} from './market-targets';
import {storedDiscovery,saveDiscovery,DISCOVERY_VERSION} from './discovery-store';
import {validateDiscovery} from './discovery';
import {snapshotForRunner} from './runner-contract';
import {marketHours} from './research-schedule';
import {eventSafetyFor} from './event-policy';
import {eventCoverage} from './event-coverage';
const reply=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const terminal=(p:string)=>['complete','obsolete','expired'].includes(p);
export async function reviewGuards(env:any){const [settings,reviews,acks,fundamentals,documents]=await Promise.all([env.DB.prepare('SELECT * FROM trade_settings ORDER BY id').all(),env.DB.prepare('SELECT * FROM trade_reviews ORDER BY id,kind').all(),env.DB.prepare('SELECT * FROM event_acknowledgements ORDER BY ticker').all(),env.DB.prepare('SELECT ticker,researched_at FROM fundamental_reviews ORDER BY ticker').all(),annualDocumentIndex(env)]);return revision([settings.results,reviews.results,acks.results,fundamentals.results,documents.revision,documents.available]);}
async function scope(env:any,snap:any){const [raw,state]=await Promise.all([storedDiscovery(env),marketState(env)]);const live={discovery:{...(raw||{}),events:JSON.parse(state?.events_json||'{}'),candidates:(raw?.candidates||[]).filter((c:any)=>!snap.holdings.some((h:any)=>h.ticker===c.ticker))}};return {exclude:snap.holdings.map((h:any)=>h.ticker),newsTickers:newsTargets(snap,live),companyNames:Object.fromEntries(live.discovery.candidates.filter((c:any)=>c.name&&c.name!==c.ticker).map((c:any)=>[c.ticker,String(c.name).slice(0,200)]))};}
function job(state:any,r:any){const s=JSON.parse(r.scope_json||'{}');return {lease:state.lease_token,reviewId:r.id,slot:r.slot,phase:r.phase,screenOnly:!!s.screenOnly,needDiscovery:!!s.needDiscovery,expiresAt:r.expires_at};}
async function obsolete(env:any,r:any,b:any,message:string){await env.DB.batch([env.DB.prepare("UPDATE market_reviews SET phase='obsolete',error=? WHERE id=?").bind(message,r.id),env.DB.prepare("UPDATE market_state SET lease_token=NULL,lease_until=NULL,requested=1,error=? WHERE id='local' AND lease_token=?").bind(message,b.lease)]);return reply({error:message,code:'SNAPSHOT_CHANGED'},409);}
async function stage(env:any,r:any,b:any,operation:string,run:(token:string)=>Promise<Response>){
 const token=crypto.randomUUID(),time=new Date().toISOString();
 const acquired=await env.DB.prepare('UPDATE market_reviews SET busy_token=?,busy_until=?,busy_operation=? WHERE id=? AND (busy_until IS NULL OR busy_until<?)').bind(token,new Date(Date.now()+70000).toISOString(),operation,r.id,time).run();
 if(!acquired.meta.changes)return reply({pending:true,operation,retryAfterMs:2000},202);
 try{return await run(token)}finally{await env.DB.prepare('UPDATE market_reviews SET busy_token=NULL,busy_until=NULL,busy_operation=NULL WHERE id=? AND busy_token=?').bind(r.id,token).run();}
}
export async function reviewProtocol(b:any,env:any):Promise<Response>{
 const time=new Date().toISOString(),slot=String(Math.floor(Date.now()/900000));
 if(b.operation==='claim'){
  if(typeof b.claimId!=='string'||!/^[\w-]{20,80}$/.test(b.claimId))return reply({error:'A stable claim identifier is required',code:'INVALID_CLAIM'},400);
  const state=await marketState(env);let active=state.review_id?await env.DB.prepare('SELECT * FROM market_reviews WHERE id=?').bind(state.review_id).first():null;
  if(state.lease_until>time){if(state.claim_id===b.claimId&&active)return reply({job:job(state,active)});return reply({job:null});}
  const raw=JSON.parse(state.discovery_json||'null'),coverage=raw?.coverage;
  const continuation=!!coverage?.needsMore&&Date.now()-Date.parse(coverage.lastBatchAt||'')>=45000;
  const retryPartial=coverage?.incompleteQueries>0&&Date.now()-Date.parse(coverage.lastBatchAt||'')>=900000;
  const technicalDue=!!state.requested||(marketHours()&&state.last_slot!==slot);
  const resume=active&&!terminal(active.phase)&&active.expires_at>time;
  if(!resume&&!technicalDue&&!continuation&&!(marketHours()&&retryPartial))return reply({job:null});
  const id=resume?active.id:crypto.randomUUID(),lease=crypto.randomUUID(),expires=resume?active.expires_at:new Date(Date.now()+15*60000).toISOString();
  const initial={screenOnly:!technicalDue,needDiscovery:!raw||raw.criteriaVersion!==DISCOVERY_VERSION||Date.now()-Date.parse(raw.asOf)>6*3600000||continuation||retryPartial};
  const result=await env.DB.batch([
   env.DB.prepare("UPDATE market_state SET lease_token=?,lease_until=?,review_id=?,claim_id=?,requested=0 WHERE id='local' AND (lease_until IS NULL OR lease_until<?)").bind(lease,new Date(Date.now()+8*60000).toISOString(),id,b.claimId,time),
   env.DB.prepare("INSERT OR IGNORE INTO market_reviews(id,slot,phase,created_at,expires_at,scope_json) SELECT ?,?,'claimed',?,?,? WHERE EXISTS(SELECT 1 FROM market_state WHERE id='local' AND review_id=? AND lease_token=?)").bind(id,slot,time,expires,JSON.stringify(initial),id,lease)
  ]);
  if(!result[0].meta.changes)return reply({job:null});
  await env.DB.prepare('DELETE FROM market_reviews WHERE expires_at<? AND id<>?').bind(new Date(Date.now()-86400000).toISOString(),id).run();
  active=await env.DB.prepare('SELECT * FROM market_reviews WHERE id=?').bind(id).first();return reply({job:job({...state,lease_token:lease},active)});
 }
 const r=typeof b.reviewId==='string'?await env.DB.prepare('SELECT * FROM market_reviews WHERE id=?').bind(b.reviewId).first():null;
 if(!r)return reply({error:'Review not found',code:'REVIEW_MISSING'},409);
 if(r.phase==='complete'&&r.completed_lease===b.lease&&['finish','screen_finish'].includes(b.operation))return reply({ok:true,alreadyCompleted:true,reviewId:r.id});
 const state=await marketState(env);
 if(state.review_id!==r.id||state.lease_token!==b.lease||state.lease_until<time)return reply({error:'Review lease expired or replaced',code:'LEASE_LOST'},409);
 if(r.expires_at<time)return obsolete(env,r,b,'Review expired before completion. A fresh snapshot is required.');
 if(b.operation==='heartbeat'){await env.DB.prepare("UPDATE market_state SET lease_until=? WHERE id='local' AND lease_token=?").bind(new Date(Date.now()+8*60000).toISOString(),b.lease).run();return reply({ok:true,reviewId:r.id});}
 if(b.operation==='fail'||b.operation==='release'){
  const message=b.operation==='release'?null:String(b.error||'Review failed').replace(/(?:sk-[\w-]+|Bearer\s+\S+)/g,'[redacted]').slice(0,800);
  await env.DB.batch([env.DB.prepare('UPDATE market_reviews SET error=? WHERE id=?').bind(message,r.id),env.DB.prepare("UPDATE market_state SET lease_token=NULL,lease_until=NULL,error=? WHERE id='local' AND lease_token=?").bind(message,b.lease)]);return reply({ok:true,resumable:true});
 }
 if(b.operation==='prepare'){
  if(r.snapshot_json)return reply({...JSON.parse(r.scope_json),phase:r.phase,snapshotAt:(await unpack(r.snapshot_json)).asOf});
  return stage(env,r,b,'prepare',async token=>{
   invalidateDashboard();const snap=compactSnapshot(await withDataBudget(45000,()=>dashboard(env))),guard=await reviewGuards(env),currentScope={...JSON.parse(r.scope_json),...await scope(env,snap)};
   const result=await env.DB.prepare("UPDATE market_reviews SET snapshot_json=?,guard_revision=?,scope_json=?,phase='prepared' WHERE id=? AND busy_token=? AND EXISTS(SELECT 1 FROM market_state WHERE lease_token=?)").bind(await pack(snap),guard,JSON.stringify(currentScope),r.id,token,b.lease).run();
   if(!result.meta.changes)return reply({error:'Review ownership changed',code:'LEASE_LOST'},409);return reply({...currentScope,phase:'prepared',snapshotAt:snap.asOf});
  });
 }
 if(!r.snapshot_json)return reply({error:'Prepare the review snapshot first',code:'PHASE_MISMATCH'},409);
 const snap=await unpack(r.snapshot_json);
 if(b.operation==='discovery'){
  const hash=await revision(b.discovery);
  if(r.discovery_hash){if(r.discovery_hash!==hash)return reply({error:'Discovery already recorded with different evidence',code:'EVIDENCE_CHANGED'},409);return reply(JSON.parse(r.scope_json));}
  const held=new Set(snap.holdings.map((h:any)=>h.ticker));const d=validateDiscovery({...b.discovery,candidates:b.discovery?.candidates?.filter((c:any)=>!held.has(c.ticker))},snapshotForRunner(snap));
  if(!d.candidates.length&&d.errors.length)return reply({error:'Screening feeds unavailable; previous evidence retained',code:'SCREENING_UNAVAILABLE'},503);
  await saveDiscovery(env,d);const currentScope={...JSON.parse(r.scope_json),...await scope(env,snap)};
  await env.DB.prepare('UPDATE market_reviews SET discovery_hash=?,scope_json=? WHERE id=?').bind(hash,JSON.stringify(currentScope),r.id).run();return reply(currentScope);
 }
 if(b.operation==='events'){
  const hash=await revision(b.events);if(r.events_hash){if(r.events_hash!==hash)return reply({error:'Events already recorded with different evidence',code:'EVIDENCE_CHANGED'},409);return reply({ok:true,alreadyRecorded:true});}
  const allowed=new Set(JSON.parse(r.scope_json).newsTickers||[]);
  if(!Array.isArray(b.events)||b.events.length>250)return reply({error:'Invalid events',code:'INVALID_EVENTS'},400);
  const events=JSON.parse(state.events_json||'{}');for(const t of allowed as Set<string>)delete events[t];
  for(const item of b.events){if(!allowed.has(item.ticker))return reply({error:'Event stock is outside this review',code:'INVALID_EVENTS'},400);
   if(!Array.isArray(item.issues)||item.issues.length>30||!Array.isArray(item.headlines)||item.headlines.length>15)return reply({error:'Invalid event evidence',code:'INVALID_EVENTS'},400);
   const parts=item.coverageVersion===2?eventCoverage(item):null,issues=item.issues.map((v:any)=>String(v).slice(0,700)),headlines=item.headlines.map((h:any)=>({title:String(h.title||'').slice(0,500),url:/^https:\/\//.test(h.url)?String(h.url).slice(0,1500):null,publishedAt:h.publishedAt}));
   const fingerprint=await revision({issues:issues.slice().sort(),news:headlines.filter((h:any)=>issues.some((i:string)=>i.includes(h.title))).map((h:any)=>({title:h.title,url:h.url,publishedAt:h.publishedAt})).sort((a:any,b:any)=>a.title.localeCompare(b.title))});
   events[item.ticker]={ticker:item.ticker,ok:item.ok===true&&(!parts||(parts.news.ok&&parts.calendar.ok)),checkedAt:time,issues,headlines,fingerprint,...parts};
  }
  await env.DB.batch([env.DB.prepare("UPDATE market_state SET events_json=? WHERE id='local' AND lease_token=?").bind(JSON.stringify(events),b.lease),env.DB.prepare("UPDATE market_reviews SET events_hash=?,phase='events' WHERE id=?").bind(hash,r.id)]);return reply({ok:true});
 }
 if(b.operation==='context'){
  if(r.frame_json)return reply({frame:await unpack(r.frame_json)});
  if(!r.events_hash)return reply({error:'Current event results are required',code:'PHASE_MISMATCH'},409);
  if(await reviewGuards(env)!==r.guard_revision)return obsolete(env,r,b,'Trade policy or event approvals changed during the review. Restarting with current checks.');
  return stage(env,r,b,'context',async token=>{
   const frame=await withDataBudget(45000,()=>loadExecutionContext(env,snap));
   // Keep the full eligible pool for shared cash allocation, without unrelated evidence/report copies.
   frame.live.discovery.candidates=frame.live.discovery.candidates.filter((c:any)=>c.status==='eligible');delete frame.live.technicalPlans;delete frame.live.monitor;
   if(frame.report)frame.report={as_of:frame.report.as_of,recommendations_json:frame.report.recommendations_json,new_stock_ideas_json:frame.report.new_stock_ideas_json};
   frame.frameAt=time;frame.expiresAt=r.expires_at;frame.reviewId=r.id;frame.targets=marketTargets(snap,frame.live);
   const result=await env.DB.prepare("UPDATE market_reviews SET frame_json=?,phase='ready' WHERE id=? AND busy_token=? AND EXISTS(SELECT 1 FROM market_state WHERE lease_token=?)").bind(await pack(frame),r.id,token,b.lease).run();
   if(!result.meta.changes)return reply({error:'Review ownership changed',code:'LEASE_LOST'},409);return reply({frame});
  });
 }
 if(b.operation==='screen_finish'){
  const message=b.error?String(b.error).slice(0,800):null;
  await env.DB.batch([env.DB.prepare("UPDATE market_reviews SET phase='complete',completed_lease=?,completed_at=?,error=? WHERE id=?").bind(b.lease,time,message,r.id),env.DB.prepare("UPDATE market_state SET lease_token=NULL,lease_until=NULL,error=? WHERE id='local' AND lease_token=?").bind(message,b.lease)]);return reply({ok:true});
 }
 if(b.operation==='finish'){
  if(r.phase!=='ready'||!r.frame_json)return reply({error:'Review frame is not ready',code:'PHASE_MISMATCH'},409);
  const frame=await unpack(r.frame_json),keys=new Set(frame.targets.map((t:any)=>JSON.stringify([t.portfolio,t.ticker]))),seen=new Set();
  if(!Array.isArray(b.plans)||b.plans.length!==keys.size||b.plans.some((p:any)=>{const k=JSON.stringify([p.portfolio,p.ticker]);if(!keys.has(k)||seen.has(k))return true;seen.add(k);return false;}))return reply({error:'Every captured target must have one result',code:'INVALID_PLANS'},400);
  const currentRevision=await withDataBudget(10000,async()=>revision(ledgerRows(await records(env))));
  if(currentRevision!==snap.ledgerRevision||await reviewGuards(env)!==r.guard_revision)return obsolete(env,r,b,'Portfolio records or trade approvals changed during the review. Restarting with a fresh snapshot.');
  const recommendations=snap.holdings.map((h:any)=>{const e=eventSafetyFor(frame.live.discovery,h.ticker),p=snap.portfolios.find((p:any)=>p.name===h.portfolio);return {portfolio:h.portfolio,ticker:h.ticker,source:'rules',action:h.action==='Add candidate'&&e.clear&&fundamentalCheck(frame.live.discovery,h.ticker,h.price,h.fundamentals?.date).clear?'buy':h.action==='Trim'?'trim':'review',reasons:h.reasons,risks:h.risks,assessed:!!p?.complete&&!h.quote?.stale&&h.price!==null&&!(h.action==='Add candidate'&&e.status==='unknown'),eventStatus:e.status};});
  const marker=crypto.randomUUID(),condition="EXISTS(SELECT 1 FROM market_reviews WHERE id=? AND phase='committing' AND busy_token=?)",errors=b.plans.filter((p:any)=>p.error).length,message=b.error?String(b.error).slice(0,800):errors?`${errors} stock plans are unavailable; purchases remain paused for those stocks.`:null;
  const result=await env.DB.batch([
   env.DB.prepare("UPDATE market_reviews SET phase='committing',busy_token=? WHERE id=? AND phase='ready' AND EXISTS(SELECT 1 FROM market_state WHERE lease_token=? AND lease_until>=?)").bind(marker,r.id,b.lease,time),
   env.DB.prepare(`INSERT INTO rule_reports(id,as_of,updated_at,recommendations_json,provider) SELECT 'latest',?,?,?,'rules' WHERE ${condition} ON CONFLICT(id) DO UPDATE SET as_of=excluded.as_of,updated_at=excluded.updated_at,recommendations_json=excluded.recommendations_json`).bind(snap.asOf,time,JSON.stringify(recommendations),r.id,marker),
   env.DB.prepare(`INSERT OR IGNORE INTO buy_review_runs(id,as_of,completed_at,status) SELECT ?,?,?,'pending' WHERE ${condition}`).bind('technical:'+r.id,snap.asOf,time,r.id,marker),
   env.DB.prepare(`UPDATE market_state SET plans_json=?,last_checked=?,last_slot=?,lease_token=NULL,lease_until=NULL,error=? WHERE id='local' AND lease_token=? AND ${condition}`).bind(JSON.stringify(b.plans),time,r.slot,message,b.lease,r.id,marker),
   env.DB.prepare("UPDATE market_reviews SET phase='complete',completed_lease=?,completed_at=?,error=?,busy_token=NULL,busy_until=NULL WHERE id=? AND busy_token=?").bind(b.lease,time,message,r.id,marker)
  ]);
  if(!result[0].meta.changes)return reply({error:'Review ownership changed before commit',code:'LEASE_LOST'},409);return reply({ok:true,positions:b.plans.length,unavailable:errors,reviewId:r.id});
 }
 return reply({error:'Unknown review operation',code:'INVALID_OPERATION'},400);
}

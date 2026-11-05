import {reviewProtocol} from './market-review';
import {eventCoverage} from './event-coverage';
import {marketTargets as targets,newsTargets} from './market-targets';
import {saveDiscovery,DISCOVERY_VERSION} from './discovery-store';
import {dashboard} from './data';
import {validateDiscovery} from './discovery';
import {snapshotForRunner} from './runner-contract';
import {liveMarket,marketState} from './market-store';
import {marketHours} from './research-schedule';
import {eventSafetyFor} from './event-policy';
import {fundamentalReviews} from './fundamental-store';
import {FUNDAMENTAL_POLICY} from './fundamental-policy';
import {annualDocumentIndex,DOCUMENT_POLICY} from './annual-documents';
const companyNames=(live:any)=>Object.fromEntries((live.discovery?.candidates||[]).filter((c:any)=>typeof c.name==='string'&&c.name!==c.ticker).map((c:any)=>[c.ticker,c.name.slice(0,200)]));
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function marketHandler(request:Request,env:any){
 const url=new URL(request.url),time=new Date().toISOString();
 if(request.method==='GET'){const state=await marketState(env),acks=await env.DB.prepare('SELECT ticker,fingerprint FROM event_acknowledgements').all(),documents=await annualDocumentIndex(env),events=JSON.parse(state?.events_json||'{}'),eventAcks=Object.fromEntries(acks.results.map((a:any)=>[a.ticker,a.fingerprint])),policy={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:await fundamentalReviews(env),documentPolicy:documents.enabled?DOCUMENT_POLICY:null,annualDocumentsAvailable:documents.available,annualDocuments:documents.reports,events,eventAcks};return json({eventAcks,eventAssessments:Object.fromEntries(Object.keys(events).map(ticker=>[ticker,eventSafetyFor(policy,ticker)])),lastChecked:state?.last_checked||null,error:state?.error||null,requested:!!state?.requested,events,intervalMinutes:15,rulesBased:true});}
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const internal=url.pathname==='/api/market/tick';
 if(internal){if(!env.RUNNER_SHARED_SECRET||request.headers.get('Authorization')!=='Bearer '+env.RUNNER_SHARED_SECRET)return json({error:'Unauthorized monitor'},401);}
 else if(request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
 const raw=await request.text();if(raw.length>12000000)return json({error:'Request too large'},413);const b=JSON.parse(raw);
 await env.DB.prepare("INSERT OR IGNORE INTO market_state(id,requested) VALUES('local',1)").run();
 if(!internal){
  if(b.operation==='refresh'){await env.DB.prepare("UPDATE market_state SET requested=1 WHERE id='local'").run();return json({ok:true,message:'Technical and event refresh requested. No AI run was queued.'});}
  if(b.operation==='acknowledge'){
   const state=await marketState(env),events=JSON.parse(state.events_json||'{}'),event=events[b.ticker];if(!event||event.fingerprint!==b.fingerprint||!event.ok)return json({error:'Events changed or coverage is unavailable. Refresh and review them again.'},409);
   await env.DB.prepare('INSERT INTO event_acknowledgements(ticker,fingerprint,created_at) VALUES(?,?,?) ON CONFLICT(ticker) DO UPDATE SET fingerprint=excluded.fingerprint,created_at=excluded.created_at').bind(b.ticker,b.fingerprint,time).run();
   await env.DB.prepare("UPDATE market_state SET requested=1 WHERE id='local'").run();return json({ok:true,message:'Events marked reviewed. Financial and technical checks still apply.'});
  }
  return json({error:'Unknown operation'},400);
 }
 if(internal&&b.version===2)return reviewProtocol(b,env).catch((e:any)=>{const message=String(e?.message||'Unknown monitor error').replace(/Bearer\s+\S+|sk-[\w-]+/g,'[redacted]').slice(0,600);console.error(JSON.stringify({component:'market-api',operation:b.operation,reviewId:b.reviewId,error:message}));return json({error:message,code:'MONITOR_API_ERROR',operation:b.operation},503);});
 if(b.operation==='claim'){
  const state=await marketState(env),slot=String(Math.floor(Date.now()/900000));
  const previous=JSON.parse(state.discovery_json||'null'),coverage=previous?.coverage;
  const continuation=!!coverage?.needsMore&&Date.now()-Date.parse(coverage.lastBatchAt||'')>=45000;
  const retryPartial=coverage?.incompleteQueries>0&&Date.now()-Date.parse(coverage.lastBatchAt||'')>=900000;
  const technicalDue=!!state.requested||(marketHours()&&state.last_slot!==slot);
  if(!technicalDue&&!continuation&&!(marketHours()&&retryPartial))return json({job:null});
  const screenOnly=!technicalDue;
  const lease=crypto.randomUUID(),until=new Date(Date.now()+8*60000).toISOString();
  const lock=await env.DB.prepare("UPDATE market_state SET lease_token=?,lease_until=?,requested=0 WHERE id='local' AND (lease_until IS NULL OR lease_until<?)").bind(lease,until,time).run();if(!lock.meta.changes)return json({job:null});
  try{const snap=await dashboard(env),live=await liveMarket(env,snap.portfolios,null,snap),rawDiscovery=JSON.parse(state.discovery_json||'null');
  return json({job:{lease,slot,exclude:snap.holdings.map((h:any)=>h.ticker),screenOnly,needDiscovery:screenOnly||rawDiscovery?.criteriaVersion!==DISCOVERY_VERSION||!rawDiscovery||Date.now()-Date.parse(rawDiscovery.asOf)>6*3600000||!!rawDiscovery.coverage?.needsMore||!!retryPartial,targets:targets(snap,live),companyNames:companyNames(live),newsTickers:newsTargets(snap,live)}});
  }catch{await env.DB.prepare("UPDATE market_state SET lease_token=NULL,lease_until=NULL,last_slot=?,error='Portfolio/market feeds unavailable. Retry at the next interval or request a refresh.' WHERE id='local'").bind(slot).run();return json({error:'Portfolio or market data unavailable'},502);}
 }
 const state=await marketState(env);if(!state||state.lease_token!==b.lease||state.lease_until<time)return json({error:'Monitor lease expired'},409);
 if(b.operation==='screen_finish'){await env.DB.prepare("UPDATE market_state SET lease_token=NULL,lease_until=NULL,error=? WHERE id='local'").bind(b.error?String(b.error).slice(0,800):null).run();return json({ok:true});}
 if(b.operation==='heartbeat'){await env.DB.prepare("UPDATE market_state SET lease_until=? WHERE id='local'").bind(new Date(Date.now()+8*60000).toISOString()).run();return json({ok:true});}
 if(b.operation==='discovery'){
  const snap=await dashboard(env),held=new Set(snap.holdings.map((h:any)=>h.ticker)),discovery=validateDiscovery({...b.discovery,candidates:b.discovery?.candidates?.filter((c:any)=>!held.has(c.ticker))},snapshotForRunner(snap));if(!discovery.candidates.length&&discovery.errors.length)return json({error:'Screening feeds failed; previous screening retained.'},503);await saveDiscovery(env,discovery);const live=await liveMarket(env,snap.portfolios,null,snap);return json({targets:targets(snap,live),companyNames:companyNames(live),newsTickers:newsTargets(snap,live)});
 }
 if(b.operation==='events'){
  const snap=await dashboard(env),live=await liveMarket(env,snap.portfolios,null,snap),allowed=new Set(newsTargets(snap,live));
  if(!Array.isArray(b.events)||b.events.length>250)return json({error:'Invalid event payload'},400);
  const events=JSON.parse(state.events_json||'{}');
  for(const ticker of allowed)delete events[ticker]; // A partial upload cannot silently reuse old coverage for an omitted target.
  for(const item of b.events){if(!allowed.has(item.ticker))continue;
   if(!Array.isArray(item.issues)||item.issues.length>30||!Array.isArray(item.headlines)||item.headlines.length>15)return json({error:'Invalid event coverage'},400);
   const parts=item.coverageVersion===2?eventCoverage(item):null;
   const issues=item.issues.map((v:any)=>String(v).slice(0,700));const headlines=item.headlines.map((h:any)=>({title:String(h.title||'').slice(0,500),url:/^https:\/\//.test(h.url)?String(h.url).slice(0,1500):null,publishedAt:h.publishedAt}));
   const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({issues:issues.slice().sort(),news:headlines.filter((h:any)=>issues.some((issue:string)=>issue.includes(h.title))).map((h:any)=>({title:h.title,url:h.url,publishedAt:h.publishedAt})).sort((a:any,b:any)=>a.title.localeCompare(b.title))}))))).map(x=>x.toString(16).padStart(2,'0')).join('');
   events[item.ticker]={ticker:item.ticker,ok:item.ok===true&&(!parts||(parts.news.ok&&parts.calendar.ok)),checkedAt:time,issues,headlines,fingerprint,...parts};
  }
  await env.DB.prepare("UPDATE market_state SET events_json=? WHERE id='local'").bind(JSON.stringify(events)).run();return json({ok:true});
 }
 if(b.operation==='finish'){
  if(!Array.isArray(b.plans)||b.plans.length>250)return json({error:'Invalid technical plans'},400);
  const snap=await dashboard(env),live=await liveMarket(env,snap.portfolios,null,snap);
  const recommendations=snap.holdings.map((h:any)=>{const event=eventSafetyFor(live.discovery,h.ticker);const portfolio=snap.portfolios.find((p:any)=>p.name===h.portfolio);return {portfolio:h.portfolio,ticker:h.ticker,source:'rules',action:h.action==='Add candidate'&&event.clear?'buy':h.action==='Trim'?'trim':'review',reasons:h.reasons,risks:h.risks,assessed:!!portfolio?.complete&&!h.quote?.stale&&h.price!==null&&!(h.action==='Add candidate'&&event.status==='unknown'),eventStatus:event.status};});
  const id='technical:'+b.slot+':'+b.lease;
  await env.DB.batch([
   env.DB.prepare("UPDATE market_state SET plans_json=?,last_checked=?,last_slot=?,lease_token=NULL,lease_until=NULL,error=? WHERE id='local'").bind(JSON.stringify(b.plans),time,b.slot,b.error?String(b.error).slice(0,800):null),
   env.DB.prepare("INSERT INTO rule_reports(id,as_of,updated_at,recommendations_json,provider) VALUES('latest',?,?,?,'rules') ON CONFLICT(id) DO UPDATE SET as_of=excluded.as_of,updated_at=excluded.updated_at,recommendations_json=excluded.recommendations_json").bind(time,time,JSON.stringify(recommendations)),
   env.DB.prepare("INSERT OR IGNORE INTO buy_review_runs(id,as_of,completed_at,status) VALUES(?,?,?,'pending')").bind(id,time,time)
  ]);return json({ok:true,positions:b.plans.length});
 }
 if(b.operation==='fail'){await env.DB.prepare("UPDATE market_state SET error=?,lease_until=NULL,lease_token=NULL,last_slot=? WHERE id='local'").bind(String(b.error||'Market monitor failed').slice(0,800),b.slot).run();return json({ok:true});}
 return json({error:'Unknown operation'},400);
}

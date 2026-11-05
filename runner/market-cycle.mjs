import {randomUUID} from 'node:crypto';
import {ControlClient,Checkpoint,MonitorError,safeError,startHeartbeat} from './market-support.mjs';
import {computeReview,technicalForStock} from './review-work.mjs';
export async function runMarketCycle({client,checkpoint,python,engine,log=()=>{},now=Date.now,stopped=()=>false,loadTechnical}){
 let saved=checkpoint.value||await checkpoint.load();if(!saved){saved={claimId:randomUUID()};await checkpoint.save(saved);}
 let job,heartbeat,step='claim';const started=now();
 try{
  job=(await client.call('claim',{claimId:saved.claimId},{timeoutMs:15000,totalMs:60000})).job;
  if(!job){await checkpoint.save(null);return {idle:true};}
  if(saved.job?.reviewId!==job.reviewId)saved={claimId:saved.claimId,job,technicals:{}};else saved.job=job;
  await checkpoint.save(saved);
  const identity={lease:job.lease,reviewId:job.reviewId,claimId:saved.claimId};heartbeat=startHeartbeat(client,identity,{log,now});
  const check=()=>{if(stopped())throw new MonitorError('Review interrupted for service shutdown',{code:'STOPPED'});heartbeat.assert();if(now()>Date.parse(job.expiresAt))throw new MonitorError('Review snapshot expired',{code:'REVIEW_EXPIRED'});};
  log({event:'review_started',reviewId:job.reviewId,phase:job.phase,resumed:!!saved.frame});
  step='prepare';const prepared=await client.call('prepare',identity,{timeoutMs:60000,totalMs:150000});check();saved.prepared=prepared;await checkpoint.save(saved);
  if(prepared.needDiscovery&&!saved.discoveryDone){
   step='discovery';try{
    if(!saved.discovery){saved.discovery=await python('discovery.py',{exclude:prepared.exclude});await checkpoint.save(saved);}
    saved.prepared={...prepared,...await client.call('discovery',{...identity,discovery:saved.discovery},{timeoutMs:60000,totalMs:120000})};
   }catch(e){if(['LEASE_LOST','SNAPSHOT_CHANGED'].includes(e.code))throw e;saved.warning='Financial screening could not refresh; older or missing financial evidence still blocks new entries.';log({event:'discovery_unavailable',reviewId:job.reviewId,error:safeError(e),code:e.code||e.name});}
   saved.discoveryDone=true;await checkpoint.save(saved);check();
  }
  if(job.screenOnly){step='screen_finish';await heartbeat.stop();await client.call('screen_finish',{...identity,error:saved.warning||''});await checkpoint.save(null);log({event:'screening_complete',reviewId:job.reviewId,elapsedMs:now()-started});return {screenOnly:true};}
  step='events';if(!saved.events){
   const tickers=saved.prepared.newsTickers||[];
   try{saved.events=(await python('events.py',{tickers,companyNames:saved.prepared.companyNames||{}})).events;}
   catch(e){saved.events=tickers.map(ticker=>({ticker,ok:false,issues:['News and calendar monitoring did not finish. Buying waits for a fresh check.'],headlines:[]}));log({event:'events_unavailable',reviewId:job.reviewId,error:safeError(e),code:e.code||e.name});}
   await checkpoint.save(saved);
  }
  log({event:'events_collected',reviewId:job.reviewId,stocks:saved.events.length,available:saved.events.filter(e=>e.ok).length,unavailable:saved.events.filter(e=>!e.ok).length,flagged:saved.events.filter(e=>e.ok&&e.issues?.length).length});
  await client.call('events',{...identity,events:saved.events},{timeoutMs:30000,totalMs:90000});check();
  step='context';if(!saved.frame){saved.frame=(await client.call('context',identity,{timeoutMs:60000,totalMs:150000})).frame;await checkpoint.save(saved);}check();
  step='technicals';const remaining=Math.max(1,Date.parse(job.expiresAt)-now()-30000),signal=AbortSignal.timeout(remaining);
  const result=await computeReview(saved.frame,{technicals:saved.technicals||{},calculate:engine.executionFromContext,load:loadTechnical||((ticker)=>technicalForStock(ticker,{snapshot:engine.technicalSnapshot,signal,log})),onProgress:async technicals=>{saved.technicals=technicals;await checkpoint.save(saved);},now,check,log});
  check();step='finish';await heartbeat.stop();await client.call('finish',{...identity,plans:result.plans,error:saved.warning||''},{timeoutMs:30000,totalMs:90000});await checkpoint.save(null);
  log({event:'review_complete',reviewId:job.reviewId,stocks:result.stocks,plans:result.plans.length,unavailable:result.unavailable,elapsedMs:now()-started});return result;
 }catch(error){
  log({event:'review_failed',reviewId:job?.reviewId,operation:error.operation||step,code:error.code||error.name,httpStatus:error.status,error:safeError(error),elapsedMs:now()-started});
  if(heartbeat)await heartbeat.stop();
  if(job)try{await client.call(error.code==='STOPPED'?'release':'fail',{lease:job.lease,reviewId:job.reviewId,error:(error.operation||step)+': '+safeError(error)},{timeoutMs:6000,totalMs:20000,attempts:2});}catch(e){log({event:'failure_report_unavailable',reviewId:job.reviewId,code:e.code||e.name,error:safeError(e)});}
  if(['SNAPSHOT_CHANGED','LEASE_LOST','REVIEW_EXPIRED','REVIEW_MISSING'].includes(error.code)||job&&now()>Date.parse(job.expiresAt))await checkpoint.save(null);
  throw error;
 }
}

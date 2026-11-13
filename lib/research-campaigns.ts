import {businessModel} from './business-model';
import {RETURN_POLICY} from './return-potential';
import {cashResearchCandidates,researchRankReason} from './cash-research';
import {fundamentalCheck,FUNDAMENTAL_POLICY,CURRENT_MATERIALITY} from './fundamental-policy';
import {DOCUMENT_POLICY} from './annual-documents';
/** Company research is independent of portfolios: one global queue ranked by business quality.
 * Portfolios only decide eligibility (some portfolio with cash can buy a share) and a small
 * fresh-cash boost; allocation and sizing stay per portfolio at purchase time. */
export const GLOBAL_QUEUE_ID='global';
export const FRESH_CASH={days:14,bonus:5};
export const campaignId=(portfolio:string,market:string)=>JSON.stringify([portfolio,market]);
const ORDER_STATE:Record<string,number>={running:4,completed:3,needs_evidence:2,failed:2,pending:1,paused:0};
/** Legacy per-portfolio worklists merge once: newest attempt state per company, highest attempt counts. */
export function mergeLegacyWork(lists:any[][]){
 const merged=new Map<string,any>();
 for(const w of lists.flat()){const prior=merged.get(w.ticker);if(!prior){merged.set(w.ticker,{...w});continue;}
  const newer=(Date.parse(w.lastAttemptAt)||0)>(Date.parse(prior.lastAttemptAt)||0)||(Date.parse(w.lastAttemptAt)||0)===(Date.parse(prior.lastAttemptAt)||0)&&(ORDER_STATE[w.state]??0)>(ORDER_STATE[prior.state]??0);
  merged.set(w.ticker,{...(newer?w:prior),attempts:Math.max(w.attempts||0,prior.attempts||0),totalAttempts:Math.max(w.totalAttempts||0,prior.totalAttempts||0)});}
 return [...merged.values()];
}
/** Idempotent: create the global queue from any per-portfolio campaigns and retire those rows (kept for rollback). */
export async function ensureGlobalQueue(env:any){
 if(await env.DB.prepare('SELECT id FROM research_campaigns WHERE id=?').bind(GLOBAL_QUEUE_ID).first())return;
 const legacy=(await env.DB.prepare('SELECT * FROM research_campaigns WHERE id<>?').bind(GLOBAL_QUEUE_ID).all()).results||[];
 const work=mergeLegacyWork(legacy.map((r:any)=>JSON.parse(r.work_json||'[]'))),enabled=!legacy.length||legacy.some((r:any)=>r.enabled)?1:0,time=new Date().toISOString();
 await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO research_campaigns(id,portfolio,market,enabled,work_json,created_at,updated_at) VALUES(?,'*','*',?,?,?,?)").bind(GLOBAL_QUEUE_ID,enabled,JSON.stringify(work),time,time),env.DB.prepare('UPDATE research_campaigns SET enabled=0 WHERE id<>?').bind(GLOBAL_QUEUE_ID)]);
}
export async function enableCampaign(env:any,_portfolio?:string,_market?:string){await ensureGlobalQueue(env);await env.DB.prepare('UPDATE research_campaigns SET enabled=1 WHERE id=?').bind(GLOBAL_QUEUE_ID).run();return GLOBAL_QUEUE_ID;}
export async function nextCampaign(env:any){await ensureGlobalQueue(env);return env.DB.prepare('SELECT * FROM research_campaigns WHERE id=? AND enabled=1').bind(GLOBAL_QUEUE_ID).first();}
/** A 'running' item whose attempt is older than the 25-minute model budget has been interrupted. */
const interrupted=(w:any,now=Date.now())=>w.state==='running'&&!(now-Date.parse(w.lastAttemptAt)<=75*60000);
const rank=(w:any)=>Number.isFinite(w.priority)?w.priority:Number.isFinite(w.researchScore)?w.researchScore:-1e9;
/** Shared ordering for both claim and the visible queue preview. Stable ties preserve financial rank. */
export function campaignQueue(work:any[],now=Date.now()){
 return work.filter(w=>w.state==='pending'||['failed','needs_evidence'].includes(w.state)&&w.attempts<3&&now-Date.parse(w.lastAttemptAt)>=86400000).sort((a,b)=>Number(a.state!=='pending')-Number(b.state!=='pending')||(a.totalAttempts||0)-(b.totalAttempts||0)||a.attempts-b.attempts||rank(b)-rank(a));
}
export function campaignSummary(row:any){
 const now=Date.now(),work=JSON.parse(row.work_json||'[]').map((w:any)=>interrupted(w,now)?{...w,state:'failed'}:w),queue=campaignQueue(work,now);
 return {id:row.id,portfolio:row.portfolio,market:row.market,enabled:!!row.enabled,total:work.length,completed:work.filter((w:any)=>w.state==='completed').length,pending:work.filter((w:any)=>w.state==='pending').length,running:work.filter((w:any)=>w.state==='running').map((w:any)=>w.ticker),needsEvidence:work.filter((w:any)=>w.state==='needs_evidence').length,failed:work.filter((w:any)=>w.state==='failed').length,next:queue.slice(0,2).map((w:any)=>w.ticker),queue:queue.slice(0,10).map((w:any,index:number)=>({ticker:w.ticker,rank:index+1,score:w.researchScore??null,reason:(w.state==='pending'?(w.totalAttempts?'Reopened after changed evidence.':'Untouched candidate; advances before retries.'):'Retry eligible: 24-hour wait elapsed and fewer than three attempts.')+' '+(w.rankReason||'Financial ranking will be refreshed at claim.')+(w.freshCash?` Fresh-cash boost +${FRESH_CASH.bonus}: recent deposit in ${w.freshCash.join(', ')}.`:''),buyers:w.affordableFor||[]})),lastScheduledAt:row.last_scheduled_at,queueAsOf:row.updated_at};
}
export async function campaignsStatus(env:any){await ensureGlobalQueue(env);const r=await env.DB.prepare('SELECT * FROM research_campaigns WHERE id=?').bind(GLOBAL_QUEUE_ID).all();return r.results.map(campaignSummary).map((c:any)=>({...c,global:true,nextScheduled:c.enabled}));}
export function freshCashPortfolios(snapshot:any,now=Date.now()){return new Set<string>((snapshot.portfolios||[]).filter((p:any)=>p.complete&&p.cash>0&&now-Date.parse(p.lastDepositAt)<=FRESH_CASH.days*86400000&&Date.parse(p.lastDepositAt)<=now+60000).map((p:any)=>p.name));}
export function campaignWork(previous:any[],snapshot:any,discovery:any,reviews:any,uploads:any[],context:any,now=Date.now(),slots=2){
 // Research is per company: rank every portfolio's eligible candidates together, whatever the market.
 const global=context?.campaignId===GLOBAL_QUEUE_ID||context?.intent==='research-queue',scope=global?{}:context;
 // A manual Deploy Cash request picks the best companies that portfolio can buy, but records attempts in the shared queue.
 const forPortfolio=global&&context?.intent==='deploy-cash'?new Set(cashResearchCandidates(snapshot,{...discovery,events:snapshot.events||discovery?.events,fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:reviews,documentPolicy:DOCUMENT_POLICY,annualDocumentsAvailable:true,annualDocuments:uploads},reviews,{portfolio:context.portfolio,market:context.market,budget:context.budget}).map((c:any)=>c.ticker)):null;const fresh=freshCashPortfolios(snapshot,now);
 const policy={...discovery,events:snapshot.events||discovery?.events,fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:reviews,documentPolicy:DOCUMENT_POLICY,annualDocumentsAvailable:true,annualDocuments:uploads};
 const ranked=cashResearchCandidates(snapshot,policy,reviews,scope).filter((c:any)=>c.researchEligible).map((c:any)=>{const boosted=(c.affordableFor||[]).filter((n:string)=>fresh.has(n));return {...c,freshCash:boosted.length?boosted:null,priority:(Number.isFinite(c.researchScore)?c.researchScore:0)+(boosted.length?FRESH_CASH.bonus:0)};}).sort((a:any,b:any)=>b.priority-a.priority),byTicker=new Map(previous.map(w=>[w.ticker,w]));
 const active=new Set(ranked.map((c:any)=>c.ticker));const work=ranked.map((c:any)=>{const key=JSON.stringify([RETURN_POLICY.version,c.metrics?.statementDate,businessModel(c).reviewKey,uploads.filter(d=>d.ticker===c.ticker).map(d=>[d.sha256,d.summaryHash]),policy.events?.[c.ticker]?.issues?.length?policy.events[c.ticker].fingerprint:null]);const previousItem=byTicker.get(c.ticker),totalAttempts=Math.max(previousItem?.totalAttempts||previousItem?.attempts||0,CURRENT_MATERIALITY.includes(reviews[c.ticker]?.policyVersion)?1:0);let old=previousItem;if(old&&old.evidenceKey!==key)old=null;
  const check=fundamentalCheck(policy,c.ticker,undefined,undefined,now,'business'),ready=CURRENT_MATERIALITY.includes(reviews[c.ticker]?.policyVersion)&&(check.clear&&c.returnPotential?.known||check.status==='reject');
  let state=ready?'completed':old?.state||'pending';if(state==='completed'&&!ready)state='pending';if(state==='paused')state='pending';if(state==='running'&&now-Date.parse(old?.lastAttemptAt)>75*60000)state='failed';
  return {ticker:c.ticker,researchScore:c.researchScore,priority:c.priority,freshCash:c.freshCash,affordableFor:c.affordableFor,rankReason:researchRankReason(c),evidenceKey:key,state,attempts:old?.attempts||0,totalAttempts,lastAttemptAt:old?.lastAttemptAt||null,runId:old?.runId||null,error:old?.error||null};});
 for(const old of previous)if(!active.has(old.ticker))work.push({...old,state:'paused'});
 const eligible=campaignQueue(work,now).filter((w:any)=>!forPortfolio||forPortfolio.has(w.ticker));
 return {work,next:eligible.slice(0,Math.max(0,slots)).map((w:any)=>w.ticker)};
}
export async function prepareCampaign(env:any,snapshot:any,discovery:any,reviews:any,uploads:any[],context:any,claim=false,runId?:string,slots=2){
 const row=await env.DB.prepare('SELECT * FROM research_campaigns WHERE id=? AND enabled=1').bind(context.campaignId).first();if(!row)return {...context,tickers:[]};
 const time=new Date().toISOString(),result=campaignWork(JSON.parse(row.work_json),snapshot,discovery,reviews,uploads,context,Date.now(),slots);
 if(claim)for(const w of result.work)if(result.next.includes(w.ticker)){w.state='running';w.attempts++;w.totalAttempts=(w.totalAttempts||0)+1;w.lastAttemptAt=time;w.runId=runId||null;w.error=null;}
 const saved=await env.DB.prepare('UPDATE research_campaigns SET work_json=?,updated_at=?,last_scheduled_at=CASE WHEN ? THEN ? ELSE last_scheduled_at END WHERE id=? AND updated_at=?').bind(JSON.stringify(result.work),time,claim?1:0,time,row.id,row.updated_at).run();if(!saved.meta.changes)throw Error('Research queue changed; retry at the next scheduled review.');
 return {...context,tickers:result.next};
}
export async function finishCampaign(env:any,snapshot:any,reviews:any[],error?:string){const context=snapshot.requestedResearch;if(!context?.campaignId)return;const row=await env.DB.prepare('SELECT * FROM research_campaigns WHERE id=?').bind(context.campaignId).first();if(!row)return;const work=JSON.parse(row.work_json),scope=new Set((snapshot.fundamentalScope||[]).map((s:any)=>s.ticker));for(const w of work){if(!scope.has(w.ticker)||w.state!=='running')continue;const r=reviews.find(r=>r.ticker===w.ticker);w.state=error?'failed':r?.decision==='supported'||r?.decision==='reject'?'completed':'needs_evidence';w.error=error?.slice(0,300)||null;}await env.DB.prepare('UPDATE research_campaigns SET work_json=?,updated_at=? WHERE id=? AND updated_at=?').bind(JSON.stringify(work),new Date().toISOString(),row.id,row.updated_at).run();}

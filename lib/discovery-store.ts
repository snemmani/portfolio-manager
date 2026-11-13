import {ValueCache} from './request-cache';
const cache=new ValueCache(1);
export const DISCOVERY_VERSION='jarvis-paginated-v2';
const REVIEWED='reviewed';
/** Retain a numerical snapshot only for a company with a saved investment review. */
export function reviewedCandidateStatements(env:any,candidates:any[]){
 return candidates.filter(c=>c?.ticker&&c.ticker!=='ORCL').map(c=>env.DB.prepare("INSERT INTO discovery_candidates(id,cycle,ticker,data_json) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM fundamental_reviews WHERE ticker=?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json WHERE COALESCE(julianday(json_extract(excluded.data_json,'$.screenedAt')),0)>=COALESCE(julianday(json_extract(discovery_candidates.data_json,'$.screenedAt')),0)").bind(REVIEWED+'|'+c.ticker,REVIEWED,c.ticker,JSON.stringify(c),c.ticker));
}
export function invalidateDiscoveryCache(){cache.clear();}
export async function retainReviewedCandidates(env:any,candidates:any[]){
 const reviews=await env.DB.prepare('SELECT ticker FROM fundamental_reviews').all();
 const reviewed=new Set(reviews.results.map((r:any)=>r.ticker)),latest=new Map<string,any>();
 for(const c of candidates){if(!reviewed.has(c?.ticker)||c.screenRefreshPending)continue;const previous=latest.get(c.ticker);if(!previous||(Date.parse(c.screenedAt)||0)>=(Date.parse(previous.screenedAt)||0))latest.set(c.ticker,c);}
 const statements=reviewedCandidateStatements(env,[...latest.values()]);
 for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));cache.clear();
}
export function retainedScreen(c:any){
 return {...c,screenRefreshPending:true,previousScreenStatus:c.status,status:c.status==='rejected'?'rejected':'watchlist',gateReasons:[`Financial recheck pending. Last screen: ${c.screenedAt||'date unavailable'}. Saved company research is retained; a current screen is required before buying.`,...(c.gateReasons||[])]};
}
export async function storedDiscovery(env:any,fallback:any=null){
 const state=await env.DB.prepare("SELECT discovery_json FROM market_state WHERE id='local'").first();const raw=JSON.parse(state?.discovery_json||'null')||fallback;
 if(!raw)return raw;
 const key=raw.asOf+'|'+raw.coverage?.lastBatchAt;
 return cache.get(key,10000,async()=>{
  const current=raw.candidateStoreVersion?(await env.DB.prepare('SELECT data_json FROM discovery_candidates WHERE cycle=? ORDER BY ticker').bind(raw.candidateCycle||raw.asOf).all()).results.map((r:any)=>JSON.parse(r.data_json)):raw.candidates||[];
  const protectedRows=await env.DB.prepare("SELECT c.data_json FROM discovery_candidates c INNER JOIN fundamental_reviews r ON r.ticker=c.ticker WHERE c.cycle=? ORDER BY c.ticker").bind(REVIEWED).all();
  const seen=new Set(current.map((c:any)=>c.ticker));
  return {...raw,candidates:[...current,...protectedRows.results.map((r:any)=>JSON.parse(r.data_json)).filter((c:any)=>!seen.has(c.ticker)).map(retainedScreen)]};
 });
}
export async function saveDiscovery(env:any,discovery:any){
 // Preserve reviewed rows before publishing a partial cycle or pruning old cycles.
 const existing=await storedDiscovery(env);
 await retainReviewedCandidates(env,[...(existing?.candidates||[]).filter((c:any)=>!c.screenRefreshPending),...discovery.candidates]);
 const {candidates,...meta}=discovery;const old=await env.DB.prepare("SELECT discovery_json FROM market_state WHERE id='local'").first();const prior=JSON.parse(old?.discovery_json||'null'),previous=prior?.candidateCycle||prior?.asOf||'',cycle=discovery.asOf+'|'+(discovery.coverage?.lastBatchAt||crypto.randomUUID());
 const statements=candidates.map((c:any)=>env.DB.prepare('INSERT INTO discovery_candidates(id,cycle,ticker,data_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json WHERE data_json<>excluded.data_json').bind(cycle+'|'+c.ticker,cycle,c.ticker,JSON.stringify(c)));
 for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));
 await env.DB.prepare("UPDATE market_state SET discovery_json=? WHERE id='local'").bind(JSON.stringify({...meta,candidateStoreVersion:1,candidateCycle:cycle})).run();
 await env.DB.prepare('DELETE FROM discovery_candidates WHERE cycle<>? AND cycle<>? AND cycle<>?').bind(cycle,previous,REVIEWED).run();cache.clear();
}
/** AI commentary uses a declared sample; it never limits the independent financial screen. */
export function researchDiscovery(discovery:any,limit=24){
 if(!discovery)return null;const rank=(c:any)=>c.status==='eligible'?0:c.status==='watchlist'?1:2;
 const pool=[...(discovery.candidates||[])].sort((a,b)=>rank(a)-rank(b)||a.ticker.localeCompare(b.ticker));const groups=new Map<string,any[]>();for(const c of pool){const key=rank(c)+':'+c.market+':'+c.category;groups.set(key,[...(groups.get(key)||[]),c]);}
 const candidates:any[]=[];for(const priority of [0,1,2]){const queues=[...groups].filter(([key])=>key.startsWith(priority+':')).map(([,v])=>v);while(candidates.length<limit&&queues.some(q=>q.length))for(const q of queues)if(q.length&&candidates.length<limit)candidates.push(q.shift());}
 return {...discovery,candidates,commentaryCoverage:{evaluatedAvailable:pool.length,included:candidates.length,limited:pool.length>candidates.length,role:'Advisory sample only; empirical eligibility is assessed independently for the full evaluated pool.'}};
}

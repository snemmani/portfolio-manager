import {returnPotential,RETURN_POLICY} from './return-potential';
import {businessModel} from './business-model';
import {fundamentalCheck,FUNDAMENTAL_POLICY,CURRENT_MATERIALITY} from './fundamental-policy';
import {cashResearchCandidates} from './cash-research';
export async function fundamentalReviews(env:any){const rows=await env.DB.prepare('SELECT ticker,data_json FROM fundamental_reviews').all();return Object.fromEntries(rows.results.map((r:any)=>[r.ticker,JSON.parse(r.data_json)]));}
export function fundamentalScope(snap:any,discovery:any,reviews:any,focus?:string,limit=2,uploads:any[]=[],request:any={}):any[]{
 const held=[...new Map<string,any>(snap.holdings.filter((h:any)=>!h.nonDiscretionary&&!h.locked).map((h:any)=>[h.ticker,{ticker:h.ticker,name:h.ticker,currency:h.currency,sector:h.sector,industry:h.industry,businessModel:h.scorecard?.businessModel,intrinsic:h.scorecard?.intrinsic,statementPeriod:h.fundamentals?.date,price:h.price,kind:'holding',value:h.value||0}])).values()];
 const fresh=(s:any)=>{const r=reviews[s.ticker],model=businessModel(s),intrinsic=s.intrinsic??s.scorecard?.intrinsic,statementPeriod=s.statementPeriod??s.metrics?.statementDate,potential=returnPotential(s.price,intrinsic,r,s.currency);if(r&&r.decision!=='reject'&&!potential.known&&!potential.codeUnsupported&&(r.returnPolicyVersion!==RETURN_POLICY.version||Date.now()-Date.parse(r.researchedAt)>=86400000))return false;if(model.reviewKey&&r?.businessModelKey!==model.reviewKey)return false;if(uploads.some(d=>d.ticker===s.ticker&&!r?.documentRefs?.some((ref:any)=>ref.id===d.id&&ref.sha256===d.sha256&&ref.summaryHash===(d.summaryHash||null))))return false;return !!r&&CURRENT_MATERIALITY.includes(r.policyVersion)&&Date.parse(r.expiresAt)>Date.now()&&(!statementPeriod||r.statementPeriod>=statementPeriod)&&(r.decision!=='incomplete'||Date.now()-Date.parse(r.researchedAt)<86400000);};
 const candidates=(discovery?.candidates||[]).filter((c:any)=>(c.status==='eligible'||c.ticker===focus&&!!reviews[c.ticker])&&!held.some(h=>h.ticker===c.ticker)).map((c:any)=>({ticker:c.ticker,name:c.name,currency:c.currency,sector:c.sector,industry:c.industry,businessModel:c.scorecard?.businessModel,intrinsic:c.scorecard?.intrinsic,statementPeriod:c.metrics?.statementDate,price:c.price,kind:'candidate',value:0}));
 const extra=new Map<string,any>();for(const d of uploads.filter(d=>d.status==='ready'))if(!held.some(h=>h.ticker===d.ticker)&&!candidates.some((c:any)=>c.ticker===d.ticker)&&(!extra.has(d.ticker)||extra.get(d.ticker).statementPeriod<d.period))extra.set(d.ticker,{ticker:d.ticker,name:d.ticker,currency:/\.(NS|BO)$/.test(d.ticker)?'INR':'USD',statementPeriod:d.period,kind:'uploaded',value:0});candidates.unshift(...extra.values());
 const order=(a:any,b:any)=>Number(fresh(a))-Number(fresh(b))||(Date.parse(reviews[a.ticker]?.researchedAt)||0)-(Date.parse(reviews[b.ticker]?.researchedAt)||0)||b.value-a.value||a.ticker.localeCompare(b.ticker);
 held.sort(order);candidates.sort(order);const output:any[]=[],first=[...held,...candidates].find(s=>s.ticker===focus);if(first)output.push(first);
 if(request.intent==='holding-review')return (request.tickers||[]).slice(0,Math.min(2,limit)).map((ticker:string)=>held.find(h=>h.ticker===ticker)).filter(Boolean);
 if(request.intent==='stale-holdings')return held.filter((s:any)=>!fresh(s));
 // Global queue: one seat for the stalest holding (an add/trim/hold decision needs a current case),
 // the rest for the companies the queue claimed. Claimed tickers are never dropped silently.
 if(request.intent==='research-queue'){const picks=(request.tickers||[]).map((t:string)=>candidates.find((c:any)=>c.ticker===t)).filter(Boolean);const cooling=new Set(request.holdingCooldown||[]),seats=request.holdingCooldown?Math.max(0,limit-picks.length):0;return [...held.filter((s:any)=>!fresh(s)&&!cooling.has(s.ticker)).slice(0,seats),...picks].slice(0,limit);}
 const cash=cashResearchCandidates(snap,{...discovery,events:snap.events||discovery?.events},reviews,request).filter((c:any)=>c.researchEligible&&(c.researchDue||!fresh(c)));
 const staleHeld=held.filter((s:any)=>!fresh(s));
 const priority=request.intent==='deploy-cash'?(Array.isArray(request.tickers)?request.tickers.map((t:string)=>cash.find((c:any)=>c.ticker===t)).filter(Boolean):cash):staleHeld.length?[]:cash.slice(0,1);
 for(const c of priority){if(output.length>=limit)break;if(!output.some(s=>s.ticker===c.ticker))output.push({ticker:c.ticker,name:c.name,currency:c.currency,sector:c.sector,industry:c.industry,businessModel:c.scorecard?.businessModel,intrinsic:c.scorecard?.intrinsic,statementPeriod:c.metrics?.statementDate,price:c.price,kind:'candidate',value:0});}
 // Scheduled runs research held companies first: an add, trim or hold decision needs a current case.
 const queues=request.intent==='deploy-cash'?[]:[held.filter((s:any)=>!fresh(s)),candidates.filter((s:any)=>!fresh(s))];
 for(const q of queues)for(const s of q){if(output.length>=limit)break;if(!output.some(p=>p.ticker===s.ticker))output.push(s);}
 return output;
}
/** Holdings whose investment case needs refreshing, stalest first. */
export function staleHoldings(snap:any,discovery:any,reviews:any,uploads:any[]=[]):any[]{return fundamentalScope(snap,discovery,reviews,undefined,Infinity,uploads,{intent:'stale-holdings'});}

import {fundamentalCheck,FUNDAMENTAL_POLICY} from './fundamental-policy';
import {cashResearchCandidates} from './cash-research';
export async function fundamentalReviews(env:any){const rows=await env.DB.prepare('SELECT ticker,data_json FROM fundamental_reviews').all();return Object.fromEntries(rows.results.map((r:any)=>[r.ticker,JSON.parse(r.data_json)]));}
export function fundamentalScope(snap:any,discovery:any,reviews:any,focus?:string,limit=2,uploads:any[]=[],request:any={}){
 const held=[...new Map<string,any>(snap.holdings.filter((h:any)=>!h.nonDiscretionary&&!h.locked).map((h:any)=>[h.ticker,{ticker:h.ticker,name:h.ticker,currency:h.currency,sector:h.sector,statementPeriod:h.fundamentals?.date,price:h.price,kind:'holding',value:h.value||0}])).values()];
 const fresh=(s:any)=>{const r=reviews[s.ticker];if(uploads.some(d=>d.ticker===s.ticker&&!r?.documentRefs?.some((ref:any)=>ref.id===d.id&&ref.sha256===d.sha256&&ref.summaryHash===(d.summaryHash||null))))return false;return !!r&&r.policyVersion==='materiality-v2'&&Date.parse(r.expiresAt)>Date.now()&&(!s.statementPeriod||r.statementPeriod>=s.statementPeriod)&&(r.decision!=='incomplete'||Date.now()-Date.parse(r.researchedAt)<86400000);};
 const candidates=(discovery?.candidates||[]).filter((c:any)=>c.status==='eligible'&&!held.some(h=>h.ticker===c.ticker)).map((c:any)=>({ticker:c.ticker,name:c.name,currency:c.currency,sector:c.sector,statementPeriod:c.metrics?.statementDate,price:c.price,kind:'candidate',value:0}));
 const extra=new Map<string,any>();for(const d of uploads.filter(d=>d.status==='ready'))if(!held.some(h=>h.ticker===d.ticker)&&!candidates.some((c:any)=>c.ticker===d.ticker)&&(!extra.has(d.ticker)||extra.get(d.ticker).statementPeriod<d.period))extra.set(d.ticker,{ticker:d.ticker,name:d.ticker,currency:/\.(NS|BO)$/.test(d.ticker)?'INR':'USD',statementPeriod:d.period,kind:'uploaded',value:0});candidates.unshift(...extra.values());
 const order=(a:any,b:any)=>Number(fresh(a))-Number(fresh(b))||(Date.parse(reviews[a.ticker]?.researchedAt)||0)-(Date.parse(reviews[b.ticker]?.researchedAt)||0)||b.value-a.value||a.ticker.localeCompare(b.ticker);
 held.sort(order);candidates.sort(order);const output:any[]=[],first=[...held,...candidates].find(s=>s.ticker===focus);if(first)output.push(first);
 const cash=cashResearchCandidates(snap,{...discovery,events:snap.events||discovery?.events},reviews,request).filter((c:any)=>c.researchDue||!fresh(c));
 const priority=request.intent==='deploy-cash'?(Array.isArray(request.tickers)?request.tickers.map((t:string)=>cash.find((c:any)=>c.ticker===t)).filter(Boolean):cash):cash.slice(0,1);
 for(const c of priority){if(output.length>=limit)break;if(!output.some(s=>s.ticker===c.ticker))output.push({ticker:c.ticker,name:c.name,currency:c.currency,sector:c.sector,statementPeriod:c.metrics?.statementDate,price:c.price,kind:'candidate',value:0});}
 const queues=request.intent==='deploy-cash'?[]:[held.filter((s:any)=>!fresh(s)),candidates.filter((s:any)=>!fresh(s))];
 while(output.length<limit&&queues.some(q=>q.length))for(const q of queues){const s=q.shift();if(s&&!output.some(p=>p.ticker===s.ticker)&&output.length<limit)output.push(s);}
 return output;
}

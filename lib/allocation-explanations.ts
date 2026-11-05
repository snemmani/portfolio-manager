import {fundamentalCheck} from './fundamental-policy';
import {candidateReview} from './discovery-review';
/** Explain only gates used by the cash planner; never turn missing evidence into a failed metric. */
export function allocationExplanations(portfolio:any,holdings:any[],market:string,discovery:any,ideas:any[],plan:any){
 const allocated=new Set(plan.allocations.map((a:any)=>a.ticker)),currency=market==='India'?'INR':'USD';
 const selectedMarket=market==='India'?'IN':'US';
 const number=(v:number)=>Number(v.toFixed(2)).toString();
 const rows:any[]=[];
 const common=(c:any)=>{
 const reasons:string[]=[];
 if(c.currency!==currency)reasons.push(`Market mismatch: this stock trades in ${c.currency}; you selected ${market}.`);
 if(!portfolio.complete)reasons.push('Portfolio valuation is incomplete: resolve unpriced holdings before any purchase can be sized.');
 if(plan.budget<=0)reasons.push('No cash budget is available for this plan.');
 return reasons;
 };
 for(const h of holdings.filter(h=>h.portfolio===portfolio.name&&!allocated.has(h.ticker))){
 const reasons=common(h),f=h.fundamentals;const investment=fundamentalCheck(discovery,h.ticker,h.price,f?.date);if(!investment.clear)reasons.push(investment.reason);
 if(h.nonDiscretionary)reasons.push('Locked ESPP holding: Jarvis excludes this stock from cash deployment.');
 else if(h.action!=='Add candidate'){
 if(h.invalid)reasons.push('Ledger or corporate-action reconciliation is required.');
 if(h.quote?.stale||!h.price||!h.fx)reasons.push('A fresh price and usable currency conversion are required.');
 if(h.weight>=10)reasons.push(`Position weight is ${number(h.weight)}%; the existing-stock add screen requires less than 10% (single-stock cap: 15%).`);
 if(h.sector==='Financials')reasons.push('The financial-services review is incomplete. The available checks cannot confirm a buy for this bank, lender, insurer or asset manager.');
 if(!f)reasons.push('Comparable company fundamentals are unavailable; the purchase screen cannot be verified.');
 else if(h.sector!=='Financials'){
 if(!f.fresh)reasons.push('Fundamental evidence is not current enough to pass the purchase screen.');
 const gates:[string,any,(n:number)=>boolean,string][]=[
 ['Revenue growth',f.revenueGrowth,n=>n>15,'above 15%'],['Earnings growth',f.earningsGrowth,n=>n>15,'above 15%'],['ROE',f.roe,n=>n>15,'above 15%'],
 ['PEG',f.peg,n=>n<1.5,'below 1.5'],['Free cash flow',f.fcf,n=>n>0,'positive'],['Debt/equity',f.debtEquity,n=>n<1,'below 1'],['Operating cash flow / net income',f.cashConversion,n=>n>=.8,'at least 0.8']];
 for(const [label,value,passes,requirement] of gates){const pct=['Revenue growth','Earnings growth','ROE'].includes(label)?'%':'';if(typeof value!=='number'||!Number.isFinite(value))reasons.push(`${label} is unavailable; required: ${requirement}.`);else if(!passes(value))reasons.push(`${label} is ${number(value)}${pct}; required: ${requirement}.`);}
 if(h.sector!=='Financials'&&(f.pe===null||f.pe===undefined))reasons.push('P/E is unavailable; comparable valuation evidence is required.');
 }
 if(!reasons.length)reasons.push(`Current assessment is “${h.action}”, not an approved add candidate. ${h.reasons?.at(-1)||'Supporting purchase evidence is incomplete.'}`);
 }
 if(h.aggregateWeight>=15)reasons.push(`Household exposure is ${number(h.aggregateWeight)}%; the single-stock cap is 15%.`);
 const skipped=plan.skipped?.find((s:any)=>s.ticker===h.ticker);if(skipped)reasons.push(...(skipped.reasons||[skipped.reason]));
 if(!reasons.length)reasons.push('No purchase quantity fits the remaining budget and portfolio exposure limits.');
 rows.push({ticker:h.ticker,kind:'Existing holding',reasons:[...new Set(reasons)]});
 }
 for(const c of discovery?.candidates||[]){if(allocated.has(c.ticker))continue;const reasons=common(c),idea=(ideas||[]).find(i=>i.portfolio===portfolio.name&&i.ticker===c.ticker);
 if(c.status!=='eligible'){reasons.push(`Screen result: ${c.status==='rejected'?'rejected':'watchlist'}; an eligible screen is required.`);reasons.push(...(c.gateReasons||[]),...(c.evidenceGaps||[]));}
 const investment=fundamentalCheck(discovery,c.ticker,c.price,c.metrics?.statementDate);if(!investment.clear)reasons.push(investment.reason);
 const review=candidateReview(c,portfolio.name,ideas);
 if(c.status==='eligible'&&review.state!=='enter')reasons.push(...review.reasons);
 if(c.market===selectedMarket&&(!Number.isFinite(Date.parse(discovery.asOf))||Date.now()-Date.parse(discovery.asOf)>6*3600000))reasons.push('Screening research is older than six hours or unavailable; refresh research before a new entry.');
 const skipped=plan.skipped?.find((s:any)=>s.ticker===c.ticker);if(skipped)reasons.push(...(skipped.reasons||[skipped.reason]));
 rows.push({ticker:c.ticker,kind:'New-stock candidate',state:review.state,label:review.label,reasons:[...new Set(reasons.length?reasons:['No purchase quantity fits the remaining budget and exposure limits.'])]});
 }
 return rows;
}

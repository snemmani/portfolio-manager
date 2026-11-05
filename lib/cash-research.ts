import {fundamentalCheck,FUNDAMENTAL_POLICY} from './fundamental-policy';
/** Research priority only. A ranking never approves a purchase. */
export function cashResearchCandidates(snapshot:any,discovery:any,reviews:any,request:any={}){
 const portfolios=(snapshot.portfolios||[]).filter((p:any)=>p.complete&&p.cash>0&&(!request.portfolio||p.name===request.portfolio));
 const currency=request.market==='India'?'INR':request.market==='US'?'USD':null;
 return (discovery?.candidates||[]).filter((c:any)=>c.status==='eligible'&&(!currency||c.currency===currency)&&!snapshot.holdings?.some((h:any)=>h.ticker===c.ticker)).map((c:any)=>{
  const priceINR=c.currency==='USD'?c.price*snapshot.fx:c.price;
  const fits=portfolios.filter((p:any)=>Number.isFinite(priceINR)&&priceINR>0&&Math.min(p.cash,Number.isFinite(request.budget)?request.budget:p.cash,p.value*.05)>= (c.currency==='INR'?priceINR:priceINR*.0001));
  const check=fundamentalCheck({...discovery,fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:reviews},c.ticker,c.price,c.metrics?.statementDate);
  const r=reviews[c.ticker],recentAttempt=!!r&&Date.now()-Date.parse(r.researchedAt)<86400000;
  const due=!r||r.policyVersion!=='materiality-v2'||check.status==='stale'||!recentAttempt&&check.status!=='supported'&&check.status!=='valuation'&&check.status!=='reject';
  const m=c.metrics||{},score=Math.min(40,Math.max(0,m.roce||m.roe||0))+Math.min(25,Math.max(0,m.revenue_growth_yoy||0))+Math.min(20,Math.max(0,(m.cash_conversion_ratio||0)*10))-Math.min(20,Math.max(0,(m.debtEquity||0)*10))-Math.min(25,Math.max(0,(m.pe_forward||m.pe_ttm||30)/2));
  return {...c,researchDue:due,affordableFor:fits.map((p:any)=>p.name),researchScore:score,reviewStatus:check.status,reviewReason:check.reason};
 }).filter((c:any)=>c.affordableFor.length).sort((a:any,b:any)=>Number(b.researchDue)-Number(a.researchDue)||Number(!!reviews[b.ticker]&&reviews[b.ticker].policyVersion!=='materiality-v2')-Number(!!reviews[a.ticker]&&reviews[a.ticker].policyVersion!=='materiality-v2')||b.researchScore-a.researchScore||a.ticker.localeCompare(b.ticker));
}

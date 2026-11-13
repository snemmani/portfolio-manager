import {returnPotential,formatPriceCagr,RETURN_POLICY} from './return-potential';
import {fundamentalCheck,FUNDAMENTAL_POLICY,CURRENT_MATERIALITY} from './fundamental-policy';
/** Research priority only. A ranking never approves a purchase. */
export function cashResearchCandidates(snapshot:any,discovery:any,reviews:any,request:any={}){
 const portfolios=(snapshot.portfolios||[]).filter((p:any)=>p.complete&&p.cash>0&&(!request.portfolio||p.name===request.portfolio));
 const currency=request.market==='India'?'INR':request.market==='US'?'USD':null;
 return (discovery?.candidates||[]).filter((c:any)=>c.status==='eligible'&&(!currency||c.currency===currency)&&!snapshot.holdings?.some((h:any)=>h.ticker===c.ticker)).map((c:any)=>{
  const priceINR=c.currency==='USD'?c.price*snapshot.fx:c.price;
  const fits=portfolios.filter((p:any)=>Number.isFinite(priceINR)&&priceINR>0&&Math.min(p.cash,Number.isFinite(request.budget)?request.budget:p.cash,p.value*.05)>= (c.currency==='INR'?priceINR:priceINR*.0001));
  const check=fundamentalCheck({...discovery,fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:reviews},c.ticker,c.price,c.metrics?.statementDate);
  const potential=returnPotential(c.price,c.scorecard?.intrinsic,reviews[c.ticker],c.currency),researchEligible=check.status!=='reject'&&!potential.codeUnsupported&&(!potential.known||potential.passes);
  const r=reviews[c.ticker],recentAttempt=!!r&&Date.now()-Date.parse(r.researchedAt)<86400000;
  const due=researchEligible&&(!r||!CURRENT_MATERIALITY.includes(r.policyVersion)||check.status==='stale'||!potential.known&&r.returnPolicyVersion!==RETURN_POLICY.version||!recentAttempt&&!['supported','valuation','return','reject'].includes(check.status));
  const m=c.metrics||{},score=Math.min(40,Math.max(0,m.roce||m.roe||0))+Math.min(25,Math.max(0,m.revenue_growth_yoy||0))+Math.min(20,Math.max(0,(m.cash_conversion_ratio||0)*10))-Math.min(20,Math.max(0,(m.debtEquity||0)*10))-Math.min(25,Math.max(0,(m.pe_forward||m.pe_ttm||30)/2));
  return {...c,returnPotential:potential,researchEligible,researchDue:due,affordableFor:fits.map((p:any)=>p.name),researchScore:score,reviewStatus:check.status,reviewReason:check.reason};
 }).filter((c:any)=>c.affordableFor.length).sort((a:any,b:any)=>Number(b.researchDue)-Number(a.researchDue)||Number(!!reviews[b.ticker]&&!CURRENT_MATERIALITY.includes(reviews[b.ticker].policyVersion))-Number(!!reviews[a.ticker]&&!CURRENT_MATERIALITY.includes(reviews[a.ticker].policyVersion))||b.researchScore-a.researchScore||a.ticker.localeCompare(b.ticker));
}

/** Explain the exact, bounded ranking inputs; missing values are identified rather than displayed as zero. */
export function researchRankReason(c:any){
 const m=c.metrics||{},fmt=(v:any,suffix:string)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2)+suffix:'unavailable';
 return `${c.returnPotential?.known?`Five-year price CAGR ${formatPriceCagr(c.returnPotential.scenarios?.find((s:any)=>s.years===5)?.cagr)}; 15% minimum required.`:'Forward price-return estimate still required; eligible for research only.'} Affordable for the selected cash plan. Financial score ${fmt(c.researchScore,'')}: return on capital ${fmt(m.roce||m.roe,'%')}, revenue growth ${fmt(m.revenue_growth_yoy,'%')}, cash/profit ${fmt(m.cash_conversion_ratio,'×')}, debt/equity ${fmt(m.debtEquity,'×')}, P/E ${fmt(m.pe_forward||m.pe_ttm,'×')}. Missing inputs use ranking defaults; this is not a buy approval.`;
}

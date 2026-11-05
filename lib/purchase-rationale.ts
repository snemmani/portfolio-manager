import {eventSafetyFor} from './event-policy';
import {recheckCandidate} from './discovery-review';
const number=(v:number)=>v.toLocaleString('en-IN',{maximumFractionDigits:2});
const money=(v:number,currency='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(v);
const financialAmount=(v:number,currency:string)=>currency==='INR'&&Math.abs(v)>=1e7?`₹${number(v/1e7)} crore`:Math.abs(v)>=1e6?`${money(v/1e6,currency)} million`:money(v,currency);
const metrics:[RegExp,string,string,string][]=[
 [/Rev Growth>([\d.]+)%/i,'revenue_growth_yoy','Revenue growth','%'],[/NI Growth>([\d.]+)%/i,'earnings_growth_yoy','Earnings growth','%'],
 [/ROE>([\d.]+)%/i,'roe','Return on equity','%'],[/ROCE>([\d.]+)%/i,'roce','Return on capital employed','%'],
 [/P\/E<([\d.]+)/i,'pe_ttm','P/E',''],[/P\/B<([\d.]+)/i,'pb','P/B',''],[/PEG<([\d.]+)/i,'peg','PEG',''],
 [/Net Margin>([\d.]+)%/i,'netMargin','Net profit margin','%'],[/ICR>([\d.]+)/i,'interestCoverage','Interest coverage',''],
 [/(?<!LT )D\/E<([\d.]+)/i,'debtEquity','Debt/equity',''],[/LT D\/E<([\d.]+)/i,'longTermDebtEquity','Long-term debt/equity','']
];
/** Explain existing evidence and sizing; this function grants no trade authority. */
export function purchaseRationale(allocation:any,portfolio:any,holdings:any[],discovery:any){
 const candidate=discovery?.candidates?.find((c:any)=>c.ticker===allocation.ticker),holding=holdings.find((h:any)=>h.ticker===allocation.ticker&&h.portfolio===portfolio.name);
 const passed=(candidate?.matchedScreens||[]).filter((s:any)=>recheckCandidate({...candidate,matchedScreens:[s]},true).status==='eligible');
 const screen=passed[0],evidence:string[]=[];
 if(screen){
  for(const [pattern,key,label,unit] of metrics){const match=String(screen.criteria).match(pattern),v=candidate.metrics?.[key];if(!match)continue;
   if(key==='interestCoverage'&&candidate.metrics?.noInterestExpense===true){evidence.push('Interest coverage: positive operating earnings and no reported interest expense.');continue;}
   if(Number.isFinite(v))evidence.push(`${label}: ${number(v)}${unit}; required ${pattern.source.includes('>')?'above':'below'} ${number(Number(match[1]))}${unit}.`);
  }
  if(String(screen.criteria).includes('FCF+ve')&&candidate.metrics?.fcf>0)evidence.push(`Free cash flow: ${financialAmount(candidate.metrics.fcf,candidate.metrics.financialCurrency||candidate.currency)}; required positive.`);
 }else if(holding)evidence.push(...(holding.reasons||[]));
 const event=eventSafetyFor(discovery,allocation.ticker);
 const position=(holding?.value||0)+allocation.amount,pct=portfolio.value>0?position/portfolio.value*100:null;
 return {
  heading:screen?`Passed the ${screen.bucket} financial screen`:holding?'Why this holding can receive more cash':'Financial evidence needs refreshing',
  evidence:evidence.length?evidence:['The current financial criteria and supporting figures are unavailable. Refresh the market checks before acting.'],
  period:candidate?.metrics?.statementDate||holding?.fundamentals?.date||null,
  sizing:`${money(allocation.amount)} is reserved for ${number(allocation.quantity)} ${allocation.currency==='INR'?'whole ':''}shares in ${portfolio.name}${pct!==null?`, taking this position to ${number(pct)}% of the portfolio`:''}. The estimate fits the cash, position and household limits; it is not an order.`,
  event:{...event,checkedAt:discovery?.events?.[allocation.ticker]?.checkedAt||null},
  caution:candidate?'Business quality, management and the full accounting history have not been fully verified. Financial screening alone does not establish future returns.':null,
  sourceUrl:candidate?.sourceUrl||'https://finance.yahoo.com/quote/'+encodeURIComponent(allocation.ticker)+'/'
 };
}

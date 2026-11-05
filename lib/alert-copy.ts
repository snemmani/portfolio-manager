import {formatIST} from './time';

const finite=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const shares=(v:number)=>v.toLocaleString('en-IN',{maximumFractionDigits:4});
const text=(v:any,max:number)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);

/** The alert's gain/loss uses the current limit and exactly the FIFO shares being sold. */
export function priceAlertContent(row:any,data:any){
 const p=data.plan,t=data.technical,a=data.saleAssessment,i=a?.impact,currency=t.currency;
 const money=(v:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
 const sell=p.side==='sell';
 const action=row.intent==='exit'?'EXIT':sell?(a?.kind==='profit'?'PROFIT-TAKING':'TRIM'):'BUY';
 const lines=[`**${action} price reached — ${text(row.ticker,50)}**`,`Portfolio: ${text(row.portfolio,100)}${currency==='USD'?' · USD':''}`];
 const validImpact=sell&&i&&i.currency===currency&&finite(i.quantity)&&Math.abs(i.quantity-p.quantity)<1e-8&&finite(i.cost)&&i.cost>=0;
 lines.push(`**${sell?'Sell':'Buy'} ${shares(p.quantity)} shares**${validImpact&&finite(i.remainingShares)?` · keep ${shares(i.remainingShares)}`:''}`);
 lines.push(`Market price: ${money(t.price)}`,`Recommended limit: ${money(p.limit)}`);
 if(sell){
  if(validImpact){
   const proceeds=p.quantity*p.limit,pnl=proceeds-i.cost,percent=i.cost>0?` (${Math.abs(pnl/i.cost*100).toFixed(1)}%)`:'';
   lines.push(`Your average purchase price: ${finite(i.averagePurchasePrice)&&i.averagePurchasePrice>=0?money(i.averagePurchasePrice):'unavailable'}`);
   lines.push(`FIFO purchase cost of these ${shares(p.quantity)} shares: ${money(i.cost)} (${money(i.cost/p.quantity)}/share)`);
   lines.push(Math.abs(pnl)<.005?'**Estimated result at limit: approximately break even before fees**':`**Estimated ${pnl<0?'loss':'profit'} at limit: ${money(Math.abs(pnl))}${percent}**`);
   lines.push(`Estimated sale proceeds: ${money(proceeds)}`);
   if(finite(i.currentWeight)&&finite(i.remainingWeight))lines.push(`Position weight: ${i.currentWeight.toFixed(2)}% → ${i.remainingWeight.toFixed(2)}%`);
  }else lines.push('Purchase cost and profit/loss estimate unavailable. Check the cost basis before selling.');
 }
 const why=Array.isArray(a?.reasons)&&a.reasons.length?a.reasons.slice(0,2).join(' '):p.decisionReason;
 lines.push(`Why: ${text(why,450)||'Review the current price plan.'}`,`Alert target: ${money(row.target)}`,`Quote: ${formatIST(t.quoteTime,true)}`);
 lines.push(sell?(currency==='USD'?'Gross USD estimates exclude fees, taxes and INR FX tax accounting.':'Estimates exclude fees and taxes.'):'Check available cash before buying.');
 lines.push('Delayed feed; confirm the broker quote. No order placed.');
 return lines.join('\n').slice(0,1950);
}

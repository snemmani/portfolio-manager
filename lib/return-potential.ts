/** Prospective price appreciation, never historical growth or a promised return. */
import {codeModelKey} from './return-basis.mjs';
const YEAR=365.25*86400000;
const positive=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const finite=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v);
export const RETURN_POLICY={version:'price-cagr-v2',minimum:0.15,requiredYears:5,displayYears:[3,5],dividendsIncluded:false,maxForecastCagr:0.35} as const;
/** A base case may not imply more than this annual growth from today's researched base value. */
export function forecastWithinBounds(year:3|5,future:any,baseNow:any){return positive(future)&&positive(baseNow)&&future<=baseNow*Math.pow(1+RETURN_POLICY.maxForecastCagr,year)*(1+1e-9);}
export function formatPriceCagr(value:any){
 if(!finite(value))return 'Pending';
 const pct=value*100;
 // A below-hurdle estimate must not look like a passing 15.00% after rounding.
 if(value<RETURN_POLICY.minimum&&pct>=14.99)return `${(Math.floor(pct*10000)/10000).toFixed(4)}%`;
 return `${pct.toFixed(Math.abs(pct-15)<.01?4:2)}%`;
}
/** Roll the existing valuation forward without restarting its ten-year growth fade.
 * The ratio preserves trading-currency conversion and the current code-value anchor.
 * Distributable earnings before the exit are excluded because this is price-only. */
export function codeFutureValue(intrinsic:any,years:3|5):number|null{
 if(!positive(intrinsic?.value)||intrinsic.binding===false)return null;
 const p=intrinsic.inputs||{},discount=p.discountPct/100;
 if(!positive(discount)||discount>1)return null;
 if(positive(p.bookPerShare)&&positive(p.roePct)&&finite(p.growthPct)){
  const growth=p.growthPct/100,roe=p.roePct/100;
  if(growth<0||growth>=discount||growth>roe*.5+5e-5||roe>.25+5e-5)return null;
  const value=intrinsic.value*Math.pow(1+growth,years);return positive(value)?value:null;
 }
 const start=p.startGrowthPct/100,terminal=p.terminalGrowthPct/100,roce=p.rocePct/100;
 if(!positive(p.earningsPerShare)||![start,terminal,roce].every(finite)||start<0||start>.3||terminal<0||terminal>start||terminal>=discount||roce<=0||roce>.5)return null;
 let earnings=1,today=0,future=0;
 for(let t=1;t<=10;t++){
  const growth=start+(terminal-start)*(t-1)/9;earnings*=1+growth;
  const available=earnings*Math.max(0,1-growth/roce);
  today+=available/Math.pow(1+discount,t);
  if(t>years)future+=available/Math.pow(1+discount,t-years);
 }
 const terminalValue=earnings*(1+terminal)*Math.max(0,1-terminal/roce)/(discount-terminal);
 today+=terminalValue/Math.pow(1+discount,10);future+=terminalValue/Math.pow(1+discount,10-years);
 const value=intrinsic.value*future/today;return positive(value)?value:null;
}
export function returnPotential(price:any,intrinsic:any,review?:any,currency?:string,now=Date.now()){
 const projection=review?.valuation?.returnProjection,asOf=Date.parse(projection?.asOf),age=now-asOf;
 const refs=projection?.sourceIds,backed=Array.isArray(refs)&&refs.length>0&&refs.every((id:any)=>typeof id==='string'&&review?.sources?.some((s:any)=>s.id===id&&s.reachable&&(s.primary||s.uploaded&&s.identityMatched)));
 const sameMoney=(a:any,b:any)=>positive(a)&&positive(b)&&Math.abs(a-b)<=.010000001;
 const anchor=projection?.valuationBasis;
 const anchorsMatch=!!anchor&&anchor.currency===currency&&sameMoney(anchor.baseValue,review?.valuation?.baseValue)&&sameMoney(anchor.maxEntry,review?.valuation?.maxEntry)&&anchor.codeModelKey===codeModelKey(intrinsic);
 const boundsValid=([3,5] as const).every(y=>{const base=projection?.[`year${y}Value`],bear=projection?.[`year${y}BearValue`],bull=projection?.[`year${y}BullValue`];return positive(base)&&forecastWithinBounds(y,base,review?.valuation?.baseValue)&&(bear==null||positive(bear)&&bear<=base)&&(bull==null||positive(bull)&&bull>=base)});
 const reconciled=projection?.scenario==='base'&&typeof projection?.reconciliation==='string'&&projection.reconciliation.trim().length>=40&&anchorsMatch&&boundsValid;
 const researched=review?.version===1&&review.decision==='supported'&&Date.parse(review.expiresAt)>now&&projection?.version===RETURN_POLICY.version&&projection.sourceBacked===true&&backed&&reconciled&&projection.asOf===review?.researchedAt&&Number.isFinite(asOf)&&age>=-60000&&age<=100*86400000&&review?.valuation?.currency===currency;
 const modelCurrency=!intrinsic?.currency||intrinsic.currency===currency;
 const codeValues=([3,5] as const).map(y=>modelCurrency?codeFutureValue(intrinsic,y):null);
 // A binding code value must cross-check the forecast; if it cannot be rolled forward, nothing qualifies.
 const codeUnsupported=modelCurrency&&positive(intrinsic?.value)&&intrinsic.binding!==false&&codeValues[1]===null;
 const diagnostics=([3,5] as const).map((years,i)=>({years,targetValue:codeValues[i],cagr:positive(price)&&positive(codeValues[i])?Math.expm1(Math.log(codeValues[i]!/price)/years):null}));
 // No code-only purchase certification. A researched BASE forecast must first
 // reconcile today's valuation and the exact code model. Select one complete
 // scenario using the stricter five-year target; do not mix models by horizon.
 const codeSelected=researched&&positive(codeValues[1])&&codeValues[1]<projection.year5Value;
 const codeValue=positive(intrinsic?.value)&&intrinsic.binding!==false&&modelCurrency?intrinsic.value:null;
 const valuationConflict=codeValue!==null&&positive(review?.valuation?.baseValue)&&!sameMoney(codeValue,review.valuation.baseValue);
 const needsReconciliation=!!review&&!researched&&(valuationConflict||!!projection||review.returnWarnings?.length>0||!modelCurrency);
 const scenarios=([3,5] as const).map(years=>{
  // Research targets retain their original exit date; time does not restart on refresh.
  const researchYears=years-age/YEAR,target=codeSelected?codeValues[years===3?0:1]:projection?.[`year${years}Value`];
  const selected=researched&&positive(target)&&researchYears>0?{value:target,years:researchYears,basis:codeSelected?'Reconciled code base case · conservative cross-check':'Reconciled research base case',targetDate:new Date(asOf+years*YEAR).toISOString()}:null;
  const entry=selected?selected.value/Math.pow(1+RETURN_POLICY.minimum,selected.years):null;
  let cagr=selected&&positive(price)?Math.expm1(Math.log(selected.value/price)/selected.years):null;
  if(selected&&positive(price)&&finite(cagr)&&cagr<.15&&cagr>=.15-1e-12&&selected.value>=price*Math.pow(1.15,selected.years))cagr=.15;
  return {years,yearsRemaining:selected?.years??null,targetValue:selected?.value??null,cagr:finite(cagr)?cagr:null,maximumEntry:positive(entry)?entry:null,basis:selected?.basis??null,targetDate:selected?.targetDate??null,researchBaseValue:researched?projection[`year${years}Value`]:null,bearValue:researched?projection[`year${years}BearValue`]??null:null,bullValue:researched?projection[`year${years}BullValue`]??null:null};
 });
 const required=scenarios[1],known=!codeUnsupported&&positive(required.maximumEntry)&&Math.floor(required.maximumEntry*100)>0,passes=known&&positive(price)&&required.targetValue!>=price*Math.pow(1+RETURN_POLICY.minimum,required.yearsRemaining!);
 const ceiling=known?Math.floor(required.maximumEntry!*100)/100:null;
 const pct=formatPriceCagr(required.cagr);
 return {policy:RETURN_POLICY.version,minimum:RETURN_POLICY.minimum,requiredYears:5,dividendsIncluded:false,entryPrice:positive(price)?price:null,scenarios,diagnostics,known,passes,ceiling,needsReconciliation,codeUnsupported,reconciliation:researched?projection.reconciliation:null,forecastAssumptions:researched?projection.assumptions:null,valuationComparison:{codeValue,researchBase:positive(review?.valuation?.baseValue)?review.valuation.baseValue:null},
  reason:codeUnsupported?'The binding code valuation cannot be rolled forward with its current inputs, so the five-year forecast cannot be cross-checked. Buying waits for new financial statements.':!known?needsReconciliation?`Return assumptions need reconciliation. ${valuationConflict?`Code value ${codeValue} and researched base value ${review.valuation.baseValue} ${currency||''} differ. `:''}A dated, source-backed base-case forecast must reconcile the current valuation and code inputs before buying.`:'A dated, source-backed five-year base-case forecast is required before buying. Code estimates alone cannot qualify a purchase.':!positive(price)?'A valid entry price is required to calculate projected price CAGR.':passes?`Modelled five-year base-case price CAGR is ${pct}; the minimum is 15%.`:`Modelled five-year base-case price CAGR is ${pct}, below the required 15%. A lower entry price is needed.`,
  assumptions:'Scenario estimates using the existing valuation assumptions. Price appreciation only; dividends, taxes and fees are excluded. Future growth, valuations and returns are uncertain.'};
}

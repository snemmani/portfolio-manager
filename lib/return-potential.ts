import {financialAssumptionIssues} from './financial-assumptions';
/** Prospective five-year total return (price plus after-tax dividends), never historical growth or a promised return. */
import {codeModelKey} from './return-basis.mjs';
const YEAR=365.25*86400000;
const positive=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const finite=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v);
/**
 * total-return-v3:
 * - hurdles follow each market's cost of equity (gates use 12% India / 9% US) plus a premium;
 * - dividends count, after a flat tax haircut, without assuming reinvestment;
 * - the exit P/E may not exceed today's or the historical median multiple (allows reversion up to the higher reference);
 * - the five-year bear case must at least return the capital (total return >= 0%).
 */
export const RETURN_POLICY={version:'total-return-v3',hurdles:{INR:0.15,USD:0.12} as Record<string,number>,defaultHurdle:0.15,requiredYears:5,displayYears:[3,5],dividendsIncluded:true,dividendTax:0.3,maxDividendYield:0.1,bearFloor:0,maxExitPe:60,maxForecastCagr:0.35} as const;
/** Required annual total return for the trading currency; an unknown currency gets the stricter hurdle. */
export function hurdleFor(currency?:string|null){return (currency&&RETURN_POLICY.hurdles[currency])||RETURN_POLICY.defaultHurdle;}
/** A base case may not imply more than this annual growth from today's researched base value. */
export function forecastWithinBounds(year:3|5,future:any,baseNow:any){return positive(future)&&positive(baseNow)&&future<=baseNow*Math.pow(1+RETURN_POLICY.maxForecastCagr,year)*(1+1e-9);}
/** Inputs that make the exit multiple, dividends and the downside explicit. */
export function projectionInputsValid(p:any){
 return positive(p?.epsNow)&&positive(p?.year5Eps)&&positive(p?.exitPe)&&p.exitPe<=RETURN_POLICY.maxExitPe&&positive(p?.historicalMedianPe)&&p.historicalMedianPe<=RETURN_POLICY.maxExitPe
  &&finite(p?.dividendPerShare)&&p.dividendPerShare>=0&&positive(p?.baseValueNow)&&p.dividendPerShare<=p.baseValueNow*RETURN_POLICY.maxDividendYield
  &&positive(p?.year5Value)&&positive(p?.year5BearValue)&&p.year5BearValue<=p.year5Value&&(p.peAtReview==null||positive(p.peAtReview));
}
/** Highest exit P/E the five-year target may use: the stated multiple, no higher than today's or the historical median. */
export function allowedExitPe(p:any){return Math.min(p.exitPe,Math.max(positive(p.peAtReview)?p.peAtReview:0,p.historicalMedianPe),RETURN_POLICY.maxExitPe);}
export function formatPriceCagr(value:any,hurdle:number=RETURN_POLICY.defaultHurdle){
 if(!finite(value))return 'Pending';
 const pct=value*100,h=hurdle*100;
 // A below-hurdle estimate must not look like a passing hurdle after rounding.
 if(value<hurdle&&pct>=h-.01)return `${(Math.floor(pct*10000)/10000).toFixed(4)}%`;
 return `${pct.toFixed(Math.abs(pct-h)<.01?4:2)}%`;
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
 const researched=review?.version===1&&review.decision==='supported'&&Date.parse(review.expiresAt)>now&&projection?.version===RETURN_POLICY.version&&projectionInputsValid(projection)&&projection.sourceBacked===true&&backed&&reconciled&&projection.asOf===review?.researchedAt&&Number.isFinite(asOf)&&age>=-60000&&age<=100*86400000&&review?.valuation?.currency===currency;
 const modelCurrency=!intrinsic?.currency||intrinsic.currency===currency;
 const codeValues=([3,5] as const).map(y=>modelCurrency?codeFutureValue(intrinsic,y):null);
 // A binding code value must cross-check the forecast; if it cannot be rolled forward, nothing qualifies.
 const codeUnsupported=modelCurrency&&positive(intrinsic?.value)&&intrinsic.binding!==false&&codeValues[1]===null;
 const diagnostics=([3,5] as const).map((years,i)=>({years,targetValue:codeValues[i],cagr:positive(price)&&positive(codeValues[i])?Math.expm1(Math.log(codeValues[i]!/price)/years):null}));
 // No code-only purchase certification. A researched BASE forecast must first
 // reconcile today's valuation and the exact code model. Select one complete
 // scenario using the stricter five-year target; do not mix models by horizon.
 const hurdle=hurdleFor(currency),floor=RETURN_POLICY.bearFloor;
 // Re-rating is bounded by the higher of the current and historical reference: the five-year research target is capped at year-5 EPS × the allowed exit P/E.
 const multipleTarget=researched?projection.year5Eps*allowedExitPe(projection):null;
 const researchTarget5=researched?Math.min(projection.year5Value,multipleTarget!):null;
 const peCapped=researched&&multipleTarget!<projection.year5Value;
 const codeSelected=researched&&positive(codeValues[1])&&codeValues[1]<researchTarget5!;
 // Scale the three-year target with the five-year cap so both horizons stay one scenario.
 const scale=researched?researchTarget5!/projection.year5Value:1;
 const dividendNet=researched?projection.dividendPerShare*(1-RETURN_POLICY.dividendTax):0;
 const codeValue=positive(intrinsic?.value)&&intrinsic.binding!==false&&modelCurrency?intrinsic.value:null;
 const valuationConflict=codeValue!==null&&positive(review?.valuation?.baseValue)&&!sameMoney(codeValue,review.valuation.baseValue);
 const legacyForecast=!!projection&&projection.version!==RETURN_POLICY.version;
 const needsReconciliation=!!review&&!researched&&(valuationConflict||!!projection||review.returnWarnings?.length>0||!modelCurrency);
 const annualised=(multiple:number,years:number)=>Math.expm1(Math.log(multiple)/years);
 const scenarios=([3,5] as const).map(years=>{
  // Research targets retain their original exit date; time does not restart on refresh.
  const researchYears=years-age/YEAR,target=codeSelected?codeValues[years===3?0:1]:researched?projection[`year${years}Value`]*scale:null;
  const selected=researched&&positive(target)&&researchYears>0?{value:target,years:researchYears,basis:codeSelected?'Reconciled code base case · conservative cross-check':peCapped?'Reconciled research base case · exit P/E capped':'Reconciled research base case',targetDate:new Date(asOf+years*YEAR).toISOString()}:null;
  const income=selected?dividendNet*selected.years:0;
  const entry=selected?(selected.value+income)/Math.pow(1+hurdle,selected.years):null;
  const priceCagr=selected&&positive(price)?annualised(selected.value/price,selected.years):null;
  let cagr=selected&&positive(price)?annualised((selected.value+income)/price,selected.years):null;
  if(selected&&positive(price)&&finite(cagr)&&cagr<hurdle&&cagr>=hurdle-1e-12&&selected.value+income>=price*Math.pow(1+hurdle,selected.years))cagr=hurdle;
  const rawBear=researched?projection[`year${years}BearValue`]:null;
  const bearValue=selected&&positive(rawBear)?Math.min(rawBear,selected.value):null;
  const bearEntry=selected&&bearValue!==null?(bearValue+income)/Math.pow(1+floor,selected.years):null;
  let bearCagr=bearValue!==null&&positive(price)?annualised((bearValue+income)/price,selected!.years):null;
  if(finite(bearCagr)&&bearCagr<floor&&bearCagr>=floor-1e-12)bearCagr=floor;
  return {years,yearsRemaining:selected?.years??null,targetValue:selected?.value??null,dividendIncome:selected?income:null,priceCagr:finite(priceCagr)?priceCagr:null,cagr:finite(cagr)?cagr:null,maximumEntry:positive(entry)?entry:null,bearEntry:positive(bearEntry)?bearEntry:null,bearCagr:finite(bearCagr)?bearCagr:null,basis:selected?.basis??null,targetDate:selected?.targetDate??null,researchBaseValue:researched?projection[`year${years}Value`]:null,bearValue:researched?projection[`year${years}BearValue`]??null:null,bullValue:researched?projection[`year${years}BullValue`]??null:null};
 });
 const required=scenarios[1],n=required.yearsRemaining!,income=required.dividendIncome??0;
 const known=!codeUnsupported&&positive(required.maximumEntry)&&positive(required.bearEntry)&&Math.floor(Math.min(required.maximumEntry,required.bearEntry)*100)>0;
 // 1e-12 relative tolerance absorbs float error in sums such as 55.8 + 3.15; it cannot admit a materially lower return.
 const atLeast=(value:number,required:number)=>value*(1+1e-12)>=required;
 const passesHurdle=known&&positive(price)&&atLeast(required.targetValue!+income,price*Math.pow(1+hurdle,n));
 const bearProtected=known&&positive(price)&&atLeast(Math.min(required.bearValue!,required.targetValue!)+income,price*Math.pow(1+floor,n));
 const passes=passesHurdle&&bearProtected;
 const ceiling=known?Math.floor(Math.min(required.maximumEntry!,required.bearEntry!)*100)/100:null;
 const pct=formatPriceCagr(required.cagr,hurdle),hurdlePct=`${round1(hurdle*100)}%`,bearPct=formatPriceCagr(required.bearCagr,floor);
 const parts=known&&positive(price)?`price ${formatPriceCagr(required.priceCagr,hurdle)}${income>0?' plus after-tax dividends':''}`:'';
 const capNote=peCapped?` The target is capped at ${round1(allowedExitPe(projection))}× year-5 earnings: exit P/E cannot exceed the higher of today's and historical median P/E.`:'';
 const reason=codeUnsupported?'The binding code valuation cannot be rolled forward with its current inputs, so the five-year forecast cannot be cross-checked. Buying waits for new financial statements.'
  :!known?legacyForecast?`The forecast predates the ${RETURN_POLICY.version} policy, which needs explicit EPS, exit and historical P/E, dividends and a five-year bear case. Scheduled research will refresh it; buying waits until then.`
   :needsReconciliation?`Return assumptions need reconciliation. ${valuationConflict?`Code value ${codeValue} and researched base value ${review.valuation.baseValue} ${currency||''} differ. `:''}A dated, source-backed base-case forecast with a bear case must reconcile the current valuation and code inputs before buying.`
   :'A dated, source-backed five-year base-case forecast with a bear case is required before buying. Code estimates alone cannot qualify a purchase.'
  :!positive(price)?'A valid entry price is required to calculate the projected return.'
  :!passesHurdle?`Modelled five-year total return is ${pct} a year (${parts}), below the required ${hurdlePct}. A lower entry price is needed.${capNote}`
  :!bearProtected?`The five-year bear case returns ${bearPct} a year, below the ${round1(floor*100)}% floor: the downside is not protected at this price. A lower entry price is needed.`
  :`Modelled five-year total return is ${pct} a year (${parts}); the minimum is ${hurdlePct}. Bear case ${bearPct} a year.${capNote}`;
 const assumptionIssues=financialAssumptionIssues(review,!!intrinsic?.inputs?.bookPerShare);
 return {assumptionsReconciled:assumptionIssues.length===0,assumptionIssues,policy:RETURN_POLICY.version,minimum:hurdle,hurdle,bearFloor:floor,requiredYears:5,dividendsIncluded:true,entryPrice:positive(price)?price:null,scenarios,diagnostics,known,passes,passesHurdle,bearProtected,peCapped,allowedExitPe:researched?allowedExitPe(projection):null,ceiling,needsReconciliation,legacyForecast,codeUnsupported,reconciliation:researched?projection.reconciliation:null,forecastAssumptions:researched?projection.assumptions:null,valuationComparison:{codeValue,researchBase:positive(review?.valuation?.baseValue)?review.valuation.baseValue:null},reason,
  assumptions:`Scenario estimates using the existing valuation assumptions. Total return = five-year price target plus dividends after a ${RETURN_POLICY.dividendTax*100}% tax haircut, not reinvested; fees excluded. Future growth, valuations and returns are uncertain.`};
}
const round1=(v:number)=>Math.round(v*10)/10;

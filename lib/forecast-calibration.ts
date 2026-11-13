import {financialAssumptionIssues} from './financial-assumptions';
/** Forecast track record: every accepted five-year forecast is logged, then scored against actual prices.
 * Comparison is price-only on both sides (dividends excluded) so a forecast is judged on what it predicted. */
import {RETURN_POLICY,hurdleFor,allowedExitPe,projectionInputsValid,returnPotential} from './return-potential';
const YEAR=365.25*86400000;
const positive=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const median=(v:number[])=>{if(!v.length)return null;const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
/** Forecasts younger than this are shown as cumulative progress, not annualised (one year is too noisy). */
export const MIN_SCORED_YEARS=1;
/** Median annual miss beyond this is reported as a systematic bias. */
export const BIAS_THRESHOLD=0.03;

export type ForecastLogRow={ticker:string;recordedAt:string;policy:string;currency:string;priceAt:number;year5Target:number;year5Bear:number|null;dividendPerShare:number|null;hurdle:number;passed:boolean;data:Record<string,any>};

/** The log row for a validated review, or null when it carries no usable forecast and review-time price. */
export function forecastLogRow(review:any,intrinsic:any=null,lender=false):ForecastLogRow|null{
 const p=review?.valuation?.returnProjection,currency=review?.valuation?.currency;
 if(!p||p.version!==RETURN_POLICY.version||!projectionInputsValid(p)||!positive(p.priceAtReview)||typeof currency!=='string'||!Number.isFinite(Date.parse(p.asOf)))return null;
 const potential=returnPotential(p.priceAtReview,intrinsic,review,currency,Date.parse(p.asOf));
 // Do not log a different target when the binding model was not supplied or cannot be reproduced.
 if(!potential.known)return null;
 const target=potential.scenarios[1].targetValue!,hurdle=potential.hurdle;
 const passed=potential.passes&&!financialAssumptionIssues(review,lender||positive(intrinsic?.inputs?.bookPerShare)).length;
 return {ticker:review.ticker,recordedAt:p.asOf,policy:p.version,currency,priceAt:p.priceAtReview,year5Target:target,year5Bear:p.year5BearValue,dividendPerShare:p.dividendPerShare,hurdle,passed,
  data:{year5Value:p.year5Value,epsNow:p.epsNow,year5Eps:p.year5Eps,exitPe:p.exitPe,historicalMedianPe:p.historicalMedianPe,peAtReview:p.peAtReview??null,decision:review.decision,gateBasis:'return-and-financial-bridge',purchaseExecuted:false}};
}

/** Database row → log row. */
export function fromDb(r:any):ForecastLogRow{return {ticker:r.ticker,recordedAt:r.recorded_at,policy:r.policy,currency:r.currency,priceAt:r.price_at,year5Target:r.year5_target,year5Bear:r.year5_bear,dividendPerShare:r.dividend_per_share,hurdle:r.hurdle,passed:!!r.passed&&JSON.parse(r.data_json||'{}').gateBasis==='return-and-financial-bridge',data:JSON.parse(r.data_json||'{}')};}

type QuoteLike={price:number|null;splits?:{date:string;ratio:number}[]};

export function scoreForecasts(rows:ForecastLogRow[],quotes:Record<string,QuoteLike|undefined>,now=Date.now()){
 const entries=rows.map(r=>{
  const q=quotes[r.ticker],price=positive(q?.price)?q!.price!:null,t0=Date.parse(r.recordedAt),elapsed=(now-t0)/YEAR;
  // Restate the review-time price for later splits/bonus issues (ratio = new shares per old share).
  const split=(q?.splits||[]).filter(s=>Date.parse(s.date)>t0&&positive(s.ratio)).reduce((m,s)=>m*s.ratio,1);
  const start=r.priceAt/split,target=r.year5Target/split;
  const forecastCagr=Math.expm1(Math.log(r.year5Target/r.priceAt)/RETURN_POLICY.requiredYears);
  const expectedSoFar=elapsed>0?Math.pow(1+forecastCagr,elapsed)-1:0;
  const actualSoFar=price!==null?price/start-1:null;
  const scored=price!==null&&elapsed>=MIN_SCORED_YEARS;
  const realizedCagr=scored?Math.expm1(Math.log(price!/start)/elapsed):null;
  return {ticker:r.ticker,recordedAt:r.recordedAt,currency:r.currency,passed:r.passed,elapsedYears:elapsed,startPrice:start,target,price,forecastCagr,realizedCagr,error:realizedCagr===null?null:realizedCagr-forecastCagr,expectedSoFar,actualSoFar,
   status:price===null?'no-price' as const:scored?'scored' as const:'early' as const};
 }).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
 const scored=entries.filter(e=>e.status==='scored'),errors=scored.map(e=>e.error!);
 // Return-qualified forecasts are a research cohort, not a record of executed purchases.
 const passedErrors=scored.filter(e=>e.passed).map(e=>e.error!);
 const medianError=median(errors);
 const bias=scored.length<5||medianError===null?'insufficient':medianError<-BIAS_THRESHOLD?'optimistic':medianError>BIAS_THRESHOLD?'conservative':'calibrated';
 return {provisional:true,limitation:'Interim price-path comparison, not a completed five-year outcome or a record of executed purchases.',policy:RETURN_POLICY.version,asOf:new Date(now).toISOString(),total:entries.length,scoredCount:scored.length,earlyCount:entries.filter(e=>e.status==='early').length,
  medianError,meanError:mean(errors),passedMedianError:median(passedErrors),passedCount:passedErrors.length,
  beatRate:scored.length?scored.filter(e=>e.error!>=0).length/scored.length:null,
  meanForecastCagr:mean(scored.map(e=>e.forecastCagr)),meanRealizedCagr:mean(scored.map(e=>e.realizedCagr!)),
  bias,
  verdict:bias==='insufficient'?`${scored.length} of ${entries.length} forecasts are at least ${MIN_SCORED_YEARS} year old with a price; at least 5 are needed before judging bias.`
   :bias==='optimistic'?`Interim tracking suggests optimistic forecasts: actual price growth trails the forecast by a median ${(Math.abs(medianError!)*100).toFixed(1)} points a year. Consider a higher hurdle or more conservative exit multiples.`
   :bias==='conservative'?`Interim tracking suggests conservative forecasts: actual price growth beats the forecast by a median ${(medianError!*100).toFixed(1)} points a year.`
   :`Interim forecasts are within ${BIAS_THRESHOLD*100} points a year of actual price growth (median).`,
  entries};
}

/** Numerical consistency is necessary evidence, not verification that an AI read a source correctly.
 *
 * Standard definitions only:
 * - EPS: owners' profit ÷ weighted shares, as reported; normalisation is an explicit, explained per-share adjustment.
 * - ROE: owners' profit ÷ AVERAGE owners' equity, as companies and data providers report it.
 * - Book value per share: closing owners' equity ÷ shares outstanding.
 * - Payout ratio: dividend per share ÷ EPS.
 * - Sustainable growth rate (Higgins): SGR ≈ ROE × (1 − payout), plus explained buybacks/issuance/OCI.
 * - Valuation identities: target = EPS × P/E = book × P/B (so P/B = P/E × ROE at the exit).
 *
 * Two kinds of check:
 * - BLOCKERS: arithmetic among the researcher's own numbers (tight tolerance) and missing evidence.
 * - WARNINGS: comparisons with independently derived figures (Yahoo statements, the app's own ROE) or with
 *   steady-state models. Definitions legitimately differ (owners vs total equity, standalone vs consolidated,
 *   share-count basis), so a gap is flagged for the reader rather than treated as a wrong number.
 */
export const FINANCIAL_ASSUMPTIONS_VERSION='financial-bridge-v1';
const finite=(v:any):v is number=>typeof v==='number'&&Number.isFinite(v);
const positive=(v:any)=>finite(v)&&v>0;
/** Arithmetic identity: 0.5% relative or 0.02 absolute. */
const close=(a:any,b:any)=>finite(a)&&finite(b)&&Math.abs(a-b)<=Math.max(.02,Math.abs(b)*.005);
/** Rate identity computed by the researcher: half a percentage point. */
const rateClose=(a:any,b:any)=>finite(a)&&finite(b)&&Math.abs(a-b)<=.005;
/** Cross-source comparisons: relative tolerance and absolute rate tolerance for warnings. */
export const CROSS_CHECK={relative:.1,rate:.02,growthGap:.02};
const relGap=(a:number,b:number)=>Math.abs(a/b-1);
const pct=(v:number)=>`${(v*100).toFixed(1)}%`;
const text=(v:any)=>typeof v==='string'&&v.trim().length>=12;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const isoDate=(v:string)=>ISO.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
/** A reporting date, or a lookback range "YYYY-MM-DD to YYYY-MM-DD" (for multi-year measures such as a median P/E). Returns the end date. */
export function periodEnd(period:any,range=false):string|null{
 if(typeof period!=='string')return null;
 if(isoDate(period))return period;
 if(!range)return null;
 const m=period.trim().match(/^(\d{4}-\d{2}-\d{2})\s*(?:to|–|—|-)\s*(\d{4}-\d{2}-\d{2})$/);
 return m&&isoDate(m[1])&&isoDate(m[2])&&m[1]<m[2]?m[2]:null;
}

export type FinancialAssumptionReview={blockers:string[];warnings:string[]};

export function financialAssumptionReview(review:any,lender=false,observed:any=null):FinancialAssumptionReview{
 const a=review?.financialAssumptions,p=review?.valuation?.returnProjection;
 if(!a||a.version!==FINANCIAL_ASSUMPTIONS_VERSION)return {blockers:['Financial assumptions need reconciliation: a sourced numerical earnings, dividend and valuation bridge is required.'],warnings:[]};
 const blockers:string[]=[],warnings:string[]=[],fail=(s:string)=>blockers.push(s),warn=(s:string)=>warnings.push(s);
 const sources=review.sources||[],researched=Date.parse(review.researchedAt||new Date().toISOString());
 const cited=(e:any,primaryOnly:boolean)=>Array.isArray(e.sourceIds)&&e.sourceIds.length>0&&e.sourceIds.every((id:any)=>sources.some((s:any)=>s.id===id&&s.reachable&&(!primaryOnly||s.primary||s.uploaded&&s.identityMatched)));
 const evidence=(e:any,{range=false,primaryOnly=true}={})=>{const end=e?periodEnd(e.period,range):null;return !!e&&['standalone','consolidated'].includes(e.scope)&&end!==null&&Date.parse(end)<=researched&&text(e.definition)&&text(e.locator)&&cited(e,primaryOnly);};

 // Reported figures come from the filings (primary sources).
 if(!evidence(a.evidence)||a.evidence.period!==review.statementPeriod)fail('Financial inputs need a current reporting period, entity scope, metric definitions and precise primary-source references.');
 if(!positive(a.reportedEps)||!finite(a.normalizationPerShare)||!positive(a.normalizedEps)||!close(a.reportedEps+a.normalizationPerShare,a.normalizedEps)||p&&!close(a.normalizedEps,p.epsNow))fail('Reported EPS, normalization adjustments and forecast starting EPS do not reconcile.');
 if(a.normalizationPerShare!==0&&!text(a.normalizationReason))fail('Explain and source the per-share earnings normalization adjustment.');
 if(positive(observed?.eps)&&positive(a.reportedEps)&&relGap(a.reportedEps,observed.eps)>CROSS_CHECK.relative)warn(`Reported EPS ${a.reportedEps} differs from the statement-derived ${+observed.eps.toFixed(2)} by ${pct(relGap(a.reportedEps,observed.eps))}. Statement-derived EPS uses total net income and current shares; check owners' profit, scope and share basis.`);
 if(!p)return {blockers:[...new Set(blockers)],warnings};

 // Forecast arithmetic (the researcher's own numbers).
 if(!finite(a.earningsGrowth)||a.earningsGrowth<=-1||a.earningsGrowth>.35||!close(a.normalizedEps*Math.pow(1+a.earningsGrowth,5),p.year5Eps))fail('The five-year EPS forecast does not reconcile with starting earnings and the stated growth rate (maximum 35%).');
 if(!finite(a.payoutRatio)||a.payoutRatio<0||a.payoutRatio>1||!close(a.normalizedEps*a.payoutRatio,p.dividendPerShare))fail('Dividend per share does not reconcile with normalized EPS and the stated payout ratio.');
 if(!positive(p.exitPe)||!close(p.year5Eps*p.exitPe,p.year5Value))fail('The researched five-year target must reconcile with projected EPS and the proposed exit P/E before applying the conservative cap.');
 // Historical P/E is a market statistic: issuers do not publish it, so reputable data providers are acceptable and a lookback range is expected.
 if(!evidence(a.multipleEvidence,{range:true,primaryOnly:false})||!positive(a.historicalMedianPe)||!close(a.historicalMedianPe,p.historicalMedianPe))fail('Historical P/E needs a sourced lookback (YYYY-MM-DD to YYYY-MM-DD), definition, calculation locator and matching value.');

 if(lender){
  const b=a.lender;
  if(!b)return {blockers:[...new Set([...blockers,'A lender requires owner book value per share, reported ROE, payout and book-growth assumptions, plus scoped capital and asset-quality metrics.'])],warnings};
  if(!positive(b.bookPerShare)||!positive(b.roe)||b.roe>.5||!finite(b.bookGrowth)||b.bookGrowth<=-1||b.bookGrowth>.35||!finite(b.otherBookGrowth))fail('Lender book value, ROE and book-growth assumptions are invalid.');
  else{
   // Sustainable growth: retained ROE plus explained other equity movements.
   const sgr=b.roe*(1-(finite(a.payoutRatio)?a.payoutRatio:0));
   if(!rateClose(sgr+b.otherBookGrowth,b.bookGrowth))fail(`Book growth ${pct(b.bookGrowth)} does not reconcile with the sustainable growth rate ROE × (1 − payout) = ${pct(sgr)} plus other equity movements ${pct(b.otherBookGrowth)}.`);
   if(b.otherBookGrowth!==0&&!text(b.otherBookGrowthReason))fail('Explain and source the buyback, issuance, OCI or other adjustment to retained-book growth.');
   if(Math.abs(b.otherBookGrowth)>.03)warn(`Other equity movements change book growth by ${pct(b.otherBookGrowth)} a year; check that this is a sourced, recurring item rather than a balancing figure.`);
   // Earnings and book growth differ only if ROE changes; flag a material drift.
   if(finite(a.earningsGrowth)&&Math.abs(a.earningsGrowth-b.bookGrowth)>CROSS_CHECK.growthGap){const drift=b.roe*Math.pow((1+a.earningsGrowth)/(1+b.bookGrowth),5);warn(`EPS growth ${pct(a.earningsGrowth)} vs book growth ${pct(b.bookGrowth)} implies ROE moving from about ${pct(b.roe)} to ${pct(drift)} in five years.`);}
  }
  if(!positive(b.exitPb)||!close(b.bookPerShare*Math.pow(1+b.bookGrowth,5)*b.exitPb,p.year5Value))fail('The P/B target and EPS × P/E target must describe the same researched scenario.');
  if(positive(observed?.bookPerShare)&&positive(b.bookPerShare)&&relGap(b.bookPerShare,observed.bookPerShare)>CROSS_CHECK.relative)warn(`Owner book per share ${b.bookPerShare} differs from the statement-derived ${+observed.bookPerShare.toFixed(2)} by ${pct(relGap(b.bookPerShare,observed.bookPerShare))}. Statement equity can include minority interests or use a different share basis.`);
  if(finite(observed?.roe)&&positive(b.roe)&&Math.abs(b.roe-observed.roe/100)>CROSS_CHECK.rate)warn(`ROE ${pct(b.roe)} differs from the statement ROE on average equity (${pct(observed.roe/100)}).`);
  for(const key of ['capital','assetQuality']){const m=b[key];if(!evidence(m)||!finite(m.value)||!finite(m.secondaryValue)||m.value<0||m.value>100||m.secondaryValue<0||m.secondaryValue>m.value)fail(`Lender ${key} needs internally consistent ratios, dates, scope and primary evidence.`);}
  if(b.capital?.scope!==b.assetQuality?.scope)fail('Capital and asset-quality ratios use different entity scopes; provide a consistent standalone or consolidated assessment.');
  if(b.capital?.period!==b.assetQuality?.period)fail('Capital and asset-quality ratios must use the same reporting period.');
 }
 return {blockers:[...new Set(blockers)],warnings:[...new Set(warnings)]};
}
/** Blocking issues only (purchase gate). */
export function financialAssumptionIssues(review:any,lender=false,observed:any=null):string[]{return financialAssumptionReview(review,lender,observed).blockers;}

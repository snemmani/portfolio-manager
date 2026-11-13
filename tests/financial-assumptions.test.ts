import assert from 'node:assert/strict';
import {multiYear} from '../lib/jarvis-gates';
import {financialAssumptionIssues,financialAssumptionReview,periodEnd} from '../lib/financial-assumptions';
import {fundamentalCheck} from '../lib/fundamental-policy';
import {validateFundamentals} from '../lib/fundamental-contract';
import {forecastLogRow} from '../lib/forecast-calibration';
import {returnPotential} from '../lib/return-potential';
import {storedFundamental,withFinancialAssumptions,fundamentalFixture} from './fundamental-fixture.mjs';
const history=multiYear([{period:'2026-03-31',NetIncome:100,StockholdersEquity:500},{period:'2025-03-31',NetIncome:80,StockholdersEquity:300}]);
assert.deepEqual(history.roeYears,[25],'ROE uses average owner equity; the oldest row without opening equity is omitted');
const r:any=storedFundamental('PFC.NS','INR',150);
const p=r.valuation.returnProjection;
p.epsNow=20;p.year5Eps=20*1.1**5;p.exitPe=5;p.year5Value=p.year5Eps*5;p.dividendPerShare=10;p.year5BearValue=100;p.priceAtReview=50;p.peAtReview=2.5;
withFinancialAssumptions(r,{inputs:{bookPerShare:100}});
assert.deepEqual(financialAssumptionIssues(r,true),[]);
const policy=(x:any)=>({fundamentalPolicy:'investor-v1',fundamentalReviews:{'PFC.NS':x},companyGates:{'PFC.NS':{financial:true,currency:'INR'}}});
assert(fundamentalCheck(policy(r),'PFC.NS',50).clear);
for(const mutate of [
 (x:any)=>delete x.financialAssumptions,
 (x:any)=>x.financialAssumptions.payoutRatio=.35,
 (x:any)=>x.financialAssumptions.earningsGrowth=.11,
 (x:any)=>x.financialAssumptions.lender.bookGrowth=.11,
 (x:any)=>x.financialAssumptions.lender.assetQuality.scope='standalone',
 (x:any)=>x.financialAssumptions.lender.capital.secondaryValue=30,
 (x:any)=>x.financialAssumptions.lender.capital.sourceIds=['invented'],
 (x:any)=>x.financialAssumptions.multipleEvidence.locator='',
 (x:any)=>x.financialAssumptions.reportedEps=21,
 (x:any)=>x.financialAssumptions.lender.exitPb=2,
 (x:any)=>x.valuation.returnProjection.year5Value*=1.1,
 (x:any)=>x.financialAssumptions.evidence.period='2099-03-31',
]){
 const bad=structuredClone(r);mutate(bad);
 assert(financialAssumptionIssues(bad,true).length);
 assert.equal(fundamentalCheck(policy(bad),'PFC.NS',50).clear,false,'Prose/source-backed passes cannot bypass an inconsistent numerical bridge');
 assert.equal(fundamentalCheck(policy(bad),'PFC.NS',50).status,'financial-reconciliation');
 assert.equal(fundamentalCheck(policy(bad),'PFC.NS',50,undefined,Date.now(),'business').clear,true,'The bridge gates buying only; holding and sale decisions use the business case');
}
// Statement-derived figures use other definitions (total vs owners' equity, share basis): differences warn, never block.
assert.deepEqual(financialAssumptionReview(r,true,{eps:19,bookPerShare:100}),{blockers:[],warnings:[]},'A 5% EPS basis difference is within tolerance');
{const x=financialAssumptionReview(r,true,{eps:15,bookPerShare:140,roe:9});assert.deepEqual(x.blockers,[]);assert.equal(x.warnings.length,3,'EPS, book and ROE gaps are reported as warnings');}
// A historical median P/E is a lookback statistic: a date range is valid, prose is not.
assert.equal(periodEnd('2021-03-31 to 2026-03-31',true),'2026-03-31');assert.equal(periodEnd('2021-03-31 to 2026-03-31'),null);
for(const bad of ['5-year lookback (FY2022-FY2026)','2026-03-31 to 2021-03-31','2021-02-30 to 2026-03-31'])assert.equal(periodEnd(bad,true),null,bad);
{const x=structuredClone(r);x.financialAssumptions.multipleEvidence.period='2021-03-31 to 2026-03-31';assert.deepEqual(financialAssumptionIssues(x,true),[]);
 x.financialAssumptions.multipleEvidence.period='5-year lookback (FY2022-FY2026)';assert(financialAssumptionIssues(x,true).some(m=>m.includes('Historical P/E')));}
// A large "other equity" plug is flagged even when the arithmetic closes.
{const x=structuredClone(r),b=x.financialAssumptions.lender;b.otherBookGrowth=-.06;b.otherBookGrowthReason='Sourced OCI and dividend-distribution adjustment.';b.bookGrowth=b.roe*(1-x.financialAssumptions.payoutRatio)-.06;
 assert(financialAssumptionReview(x,true).warnings.some(w=>w.includes('balancing figure')));}
// A missing bridge holds back the purchase forecast but does not downgrade a source-backed business case.
const raw:any=fundamentalFixture();delete raw.financialAssumptions;
const validated=validateFundamentals([raw],{fundamentalPolicy:'investor-v1',fundamentalScope:[{ticker:raw.ticker,currency:'INR',price:50}],fundamentalProfiles:{[raw.ticker]:{website:'https://issuer.example'}}},raw.sources.map((s:any)=>({ticker:raw.ticker,url:s.url,reachable:true})))[0];
assert.equal(validated.decision,'supported');assert(validated.returnWarnings.some((s:string)=>s.includes('Financial assumptions')));assert(!validated.blockingReasons.some((s:string)=>s.includes('Financial assumptions')));
assert.equal(fundamentalCheck({fundamentalPolicy:'investor-v1',fundamentalReviews:{[raw.ticker]:validated}},raw.ticker,50).status,'financial-reconciliation');
// The log must use the exact same binding code scenario, not the more optimistic research target.
const intrinsic={value:40,inputs:{bookPerShare:100,roePct:20,growthPct:5,discountPct:12}};
const {codeModelKey}=await import('../lib/return-basis.mjs');
r.valuation.returnProjection.valuationBasis.codeModelKey=codeModelKey(intrinsic);
const result=returnPotential(50,intrinsic,r,'INR',Date.parse(r.researchedAt));
const row=forecastLogRow(r,intrinsic,true)!;
assert(row);assert.equal(row.passed,result.passes);assert.equal(row.year5Target,result.scenarios[1].targetValue);assert.equal(forecastLogRow(r),null,'Missing captured model cannot produce a different certified log');
// Stress rounding and coherent lender identities across a broad range of EPS and growth.
for(let i=1;i<=2000;i++){
 const x=structuredClone(r),f=x.valuation.returnProjection,g=(i%20)/100;
 f.epsNow=10+i%40;f.year5Eps=f.epsNow*(1+g)**5;f.exitPe=5+i%10;f.year5Value=f.year5Eps*f.exitPe;f.dividendPerShare=f.epsNow*.4;
 withFinancialAssumptions(x,{inputs:{bookPerShare:f.epsNow/.2}});
 assert.deepEqual(financialAssumptionIssues(x,true),[]);
 x.financialAssumptions.lender.bookGrowth+=.01;
 assert(financialAssumptionIssues(x,true).length,'A one-point growth inconsistency must fail');
}
console.log('PASS: standard-definition financial bridges, purchase-only gating, cross-source warnings, lookback periods, balancing-figure flags, captured-model logging and 2,000 lender stress cases');

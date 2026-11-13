import assert from 'node:assert/strict';
import {RETURN_POLICY,returnPotential,allowedExitPe,hurdleFor} from '../lib/return-potential';
import {fundamentalCheck,FUNDAMENTAL_POLICY} from '../lib/fundamental-policy';
import {validateFundamentals} from '../lib/fundamental-contract';
import {forecastLogRow,scoreForecasts,fromDb} from '../lib/forecast-calibration';
import {withFinancialAssumptions,fundamentalFixture,storedFundamental} from './fundamental-fixture.mjs';

const T='AAA.NS',YEAR=365.25*86400000;
/** Supported review whose forecast is fully controlled by the test (no code model). */
function review(p:Record<string,any>={},currency='INR'){
 const r:any=storedFundamental(T,currency,150);
 Object.assign(r,{expiresAt:new Date(Date.now()+90*864e5).toISOString(),blockingReasons:[],warnings:[],policyVersion:'materiality-v3'});
 r.valuation.currency=currency;r.valuation.returnProjection.valuationBasis.currency=currency;
 r.valuation.returnProjection={...r.valuation.returnProjection,year3Value:150,year5Value:200,year5BearValue:200,epsNow:10,year5Eps:200/60,exitPe:60,historicalMedianPe:60,dividendPerShare:0,...p};
 if(p.year5Eps===undefined)r.valuation.returnProjection.year5Eps=r.valuation.returnProjection.year5Value/r.valuation.returnProjection.exitPe;
 return withFinancialAssumptions(r);
}
const at=(r:any)=>Date.parse(r.researchedAt);

// 1. Market hurdles: 15% India, 12% US, from the same 13% price path.
{const price=200/Math.pow(1.13,5);
 const inr=returnPotential(price,null,review(),'INR',at(review()));
 const usdReview=review({},'USD'),usd=returnPotential(price,null,usdReview,'USD',at(usdReview));
 assert(inr.known&&usd.known);assert(Math.abs(inr.scenarios[1].cagr!-.13)<1e-9);
 assert(!inr.passes,'13% fails the 15% India hurdle');assert(usd.passes,'13% clears the 12% US hurdle');
 assert.equal(inr.hurdle,.15);assert.equal(usd.hurdle,.12);assert.match(inr.reason,/below the required 15%/);}

// 2. Dividends count after the tax haircut, without reinvestment.
{const r=review({dividendPerShare:8}),price=100,x=returnPotential(price,null,r,'INR',at(r));
 const income=8*(1-RETURN_POLICY.dividendTax)*5;
 assert(Math.abs(x.scenarios[1].dividendIncome!-income)<1e-6);
 assert(Math.abs(x.scenarios[1].cagr!-(Math.pow((200+income)/price,1/5)-1))<1e-9);
 assert(Math.abs(x.scenarios[1].priceCagr!-(Math.pow(2,1/5)-1))<1e-9,'Price-only CAGR is still reported separately');
 assert(x.scenarios[1].cagr!>x.scenarios[1].priceCagr!);
 const noDiv=review(),y=returnPotential(108,null,noDiv,'INR',at(noDiv)),withDiv=review({dividendPerShare:10}),z=returnPotential(108,null,withDiv,'INR',at(withDiv));
 assert(!y.passes&&z.passes,'A dividend payer can clear the hurdle on total return when price alone does not');
 assert(Math.abs(z.ceiling!-Math.floor((200+10*.7*5)/Math.pow(1.15,5)*100)/100)<1e-6);}

// 3. Exit P/E cap: no re-rating above the higher of today's and the historical median multiple.
{const r=review({year5Value:400,year5BearValue:150,year5Eps:10,exitPe:40,historicalMedianPe:20,peAtReview:15});
 assert.equal(allowedExitPe(r.valuation.returnProjection),20);
 const x=returnPotential(80,null,r,'INR',at(r));
 assert(x.peCapped);assert.equal(x.scenarios[1].targetValue,200,'Target = year-5 EPS × allowed P/E');
 assert(Math.abs(x.scenarios[0].targetValue!-150*200/400)<1e-9,'The three-year target is scaled with the five-year cap');
 assert.match(x.reason,/20× year-5 earnings/);
 const cheap=review({year5Value:400,year5BearValue:150,year5Eps:10,exitPe:40,historicalMedianPe:20,peAtReview:30});
 assert.equal(allowedExitPe(cheap.valuation.returnProjection),30,"Today's higher multiple may persist");
 const capped=review({year5Value:400,year5BearValue:150,year5Eps:10,exitPe:90,historicalMedianPe:20,peAtReview:200});
 assert.equal(returnPotential(80,null,capped,'INR',at(capped)).known,false,'An exit P/E above the absolute 60× limit is invalid');
 const uncapped=review({year5Value:180,year5Eps:10,exitPe:18,historicalMedianPe:25});
 assert(!returnPotential(80,null,uncapped,'INR',at(uncapped)).peCapped);}

// 4. Bear floor: the five-year bear case must return the capital.
{const r=review({year5Value:400,year5BearValue:90});
 const x=returnPotential(100,null,r,'INR',at(r));
 assert(x.known&&x.passesHurdle&&!x.bearProtected&&!x.passes);
 assert.equal(x.ceiling,90,'The ceiling is the lower of the hurdle and bear-case limits');
 assert.match(x.reason,/bear case/i);
 assert(returnPotential(90,null,r,'INR',at(r)).passes,'At the bear-protected ceiling the gate passes');
 const policy={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:{[T]:r}};
 assert.equal(fundamentalCheck(policy,T,100).status,'valuation','Bear-case failure waits for a lower price like a valuation ceiling');
 const missing=review({year5BearValue:null});assert(!returnPotential(50,null,missing,'INR',at(missing)).known,'A bear case is required');
 const above=review({year5BearValue:250});assert(!returnPotential(50,null,above,'INR',at(above)).known,'A bear case above the base is invalid');}

// 5. Every advertised ceiling clears the gate itself (dividends, caps and bear limits combined).
for(let i=1;i<=3000;i++){
 const y5=60+i%400,bear=y5*(.3+(i%7)/10),dps=(i%5)*.9,eps=1+i%13,median=8+i%40,pe=5+i%50,currency=i%2?'INR':'USD';
 const r=review({year5Value:y5,year5BearValue:Math.min(bear,y5),dividendPerShare:dps,year5Eps:eps,exitPe:pe,historicalMedianPe:median,peAtReview:i%3?null:10+i%30},currency);
 const x=returnPotential(10+i%150,null,r,currency,at(r));if(!x.known)continue;
 if(x.ceiling!>0){const c=returnPotential(x.ceiling,null,r,currency,at(r));assert(c.passes,'ceiling '+i);}
 if(x.passes){assert(x.scenarios[1].cagr!>=hurdleFor(currency)-1e-12);assert(x.scenarios[1].bearCagr!>=-1e-12);}
}

// 6. Legacy forecasts cannot authorise a buy and say why.
{const r=review();r.valuation.returnProjection.version='price-cagr-v2';
 const x=returnPotential(50,null,r,'INR',at(r));
 assert(!x.known&&x.legacyForecast&&x.needsReconciliation);assert.match(x.reason,/total-return-v3/);}

// 7. Contract: v3 fields are required and today's P/E comes from the supplied quote.
{const raw:any=fundamentalFixture(T,'INR');
 const snapshot={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalScope:[{ticker:T,currency:'INR',statementPeriod:raw.statementPeriod,price:120}],fundamentalProfiles:{[T]:{website:'https://issuer.example'}}};
 const checks=raw.sources.map((s:any)=>({ticker:T,url:s.url,reachable:true}));
 raw.valuation.returnProjection={...raw.valuation.returnProjection,epsNow:8,peAtReview:999};withFinancialAssumptions(raw);
 const ok=validateFundamentals([raw],snapshot,checks)[0].valuation.returnProjection;
 assert(ok);assert.equal(ok.peAtReview,15,'peAtReview = quote ÷ epsNow, never the forecast-supplied value');assert.equal(ok.priceAtReview,120);
 for(const [field,value] of [['year5BearValue',null],['year5BearValue',900],['exitPe',0],['exitPe',61],['historicalMedianPe',null],['epsNow',-1],['year5Eps',0],['dividendPerShare',-1],['dividendPerShare',raw.valuation.baseValue*.11]] as const){
  const bad=structuredClone(raw);bad.valuation.returnProjection[field]=value;
  const v=validateFundamentals([bad],snapshot,checks)[0];
  assert.equal(v.valuation.returnProjection,null,`${field}=${value} must not certify a forecast`);assert.match(v.returnWarnings.join(' '),/EPS|bear|dividend|growth bound/);
 }}

// 8. Track record: logging and scoring.
{const r=review({year5Value:200,year5BearValue:120,dividendPerShare:2,priceAtReview:100,peAtReview:10});
 const row=forecastLogRow(r)!;assert(row);assert.equal(row.priceAt,100);assert.equal(row.year5Target,200);assert.equal(row.hurdle,.15);assert(row.passed);
 assert.equal(forecastLogRow({...r,valuation:{...r.valuation,returnProjection:{...r.valuation.returnProjection,priceAtReview:null}}}),null,'No review-time price, nothing to score');
 assert.deepEqual(fromDb({ticker:'X',recorded_at:'2020-01-01',policy:'p',currency:'INR',price_at:1,year5_target:2,year5_bear:1,dividend_per_share:0,hurdle:.15,passed:1,data_json:'{"a":1}'}).data,{a:1});
 const now=Date.parse('2026-01-01T00:00:00Z'),f=Math.pow(2,1/5)-1;
 const mk=(ticker:string,yearsAgo:number)=>({...row,ticker,recordedAt:new Date(now-yearsAgo*YEAR).toISOString()});
 // Five two-year-old forecasts that grew 5% a year instead of ~14.9% → optimistic.
 const rows=['A','B','C','D','E'].map(t=>mk(t,2)),quotes:any=Object.fromEntries(rows.map(x=>[x.ticker,{price:100*1.05**2,splits:[]}]));
 const s=scoreForecasts([...rows,mk('NEW',.25)],{...quotes,NEW:{price:103,splits:[]}},now);
 assert.equal(s.scoredCount,5);assert.equal(s.earlyCount,1);assert.equal(s.bias,'optimistic');
 assert(Math.abs(s.medianError!-(.05-f))<1e-9);assert.match(s.verdict,/optimistic/);
 const early=s.entries.find((e:any)=>e.ticker==='NEW')!;assert.equal(early.status,'early');assert(Math.abs(early.actualSoFar!-.03)<1e-9);assert.equal(early.realizedCagr,null);
 // A 2:1 split after the review halves the starting price instead of looking like a 50% loss.
 const split=scoreForecasts([mk('S',2)],{S:{price:100*1.149**2/2,splits:[{date:new Date(now-YEAR).toISOString().slice(0,10),ratio:2}]}},now);
 assert(Math.abs(split.entries[0].realizedCagr!-.149)<1e-9);assert.equal(split.bias,'insufficient');
 assert.equal(scoreForecasts([mk('Q',3)],{},now).entries[0].status,'no-price');}

console.log('PASS: market hurdles (15% INR / 12% USD), after-tax dividends, exit-P/E cap, bear-case floor as margin of safety, self-consistent ceilings across 3,000 states, legacy forecast refresh, v3 contract validation and split-restated forecast calibration.');

import assert from 'node:assert/strict';
import {RETURN_POLICY,returnPotential,codeFutureValue} from '../lib/return-potential';
import {fundamentalCheck,FUNDAMENTAL_POLICY} from '../lib/fundamental-policy';
import {buyCeiling} from '../lib/buy-ceiling';
import {validateFundamentals} from '../lib/fundamental-contract';
import {fundamentalFixture,storedFundamental,bindReturnBasis} from './fundamental-fixture.mjs';
const now=Date.now(),ticker='AAA.NS';
function research(future5=100*Math.pow(1.15,5),future3=160){const r:any=storedFundamental(ticker,'INR',150);r.expiresAt=new Date(Date.now()+100*86400000).toISOString();r.blockingReasons=[];r.policyVersion='materiality-v3';r.valuation.returnProjection={...r.valuation.returnProjection,year3Value:future3,year5Value:future5};const base=Math.max(r.valuation.baseValue,future5/4,future3/2.4);r.valuation.baseValue=base;r.valuation.bullValue=Math.max(r.valuation.bullValue,base);r.valuation.returnProjection.baseValueNow=base;r.valuation.returnProjection.valuationBasis.baseValue=base;return r;}
assert.equal(RETURN_POLICY.requiredYears,5);assert(!RETURN_POLICY.dividendsIncluded);
const flat={value:100,currency:'INR',inputs:{earningsPerShare:10,startGrowthPct:0,terminalGrowthPct:0,discountPct:10,rocePct:20}};
for(const h of [3,5] as const)assert(Math.abs(codeFutureValue(flat,h)!-100)<1e-9,'A flat earnings perpetuity has a flat future price, not 10% price appreciation');
const r=research(),at=Date.parse(r.researchedAt);assert(returnPotential(100,null,r,'INR',at).passes,'Exactly 15% qualifies');
assert(!returnPotential(100,null,research(100*Math.pow(1.149999,5)),'INR',Date.now()).passes,'14.9999% is not rounded up to eligibility');
assert(returnPotential(100,null,research(100*Math.pow(1.150001,5)),'INR',Date.now()).passes);
const threeOnly=returnPotential(100,null,research(200,160),'INR',Date.now());assert(threeOnly.scenarios[0].cagr!>.15);assert(threeOnly.scenarios[1].cagr!<.15);assert(!threeOnly.passes,'A strong three-year estimate cannot override the five-year gate');
for(const price of [null,undefined,0,-1,NaN,Infinity])assert(!returnPotential(price,flat,r,'INR',at).passes);
for(const model of [null,{value:100},{...flat,binding:false},{...flat,currency:'USD'},{...flat,inputs:{...flat.inputs,discountPct:0}},{...flat,inputs:{...flat.inputs,terminalGrowthPct:10}}])assert(!returnPotential(50,model,undefined,'INR').known);
const noProof=structuredClone(r);noProof.sources=[];assert(!returnPotential(100,null,noProof,'INR',at).known,'An AI flag cannot certify its own forecast');
assert(!returnPotential(100,null,r,'USD',at).known);
const expired={...r,expiresAt:new Date(at-1).toISOString()};assert(!returnPotential(100,null,expired,'INR',at).known);
const later=returnPotential(100,null,r,'INR',at+86400000);assert.equal(later.scenarios[1].targetDate,returnPotential(100,null,r,'INR',at).scenarios[1].targetDate,'A research target date never resets as time passes');
const both=returnPotential(50,flat,bindReturnBasis(research(1e8,1e8),flat),'INR');assert(Math.abs(both.scenarios[1].targetValue!-100)<1e-8,'A researched bull-like target cannot inflate a reliable code scenario');
const bank={value:200,currency:'INR',inputs:{bookPerShare:100,roePct:20,growthPct:5,discountPct:12}};assert(Math.abs(codeFutureValue(bank,5)!-200*Math.pow(1.05,5))<1e-9);
for(let i=1;i<=6000;i++){
 const value=10+i/7,price=1+i/20,model={...flat,value},x=returnPotential(price,model,bindReturnBasis(research(1e12,1e12),model),'INR'),usdModel={...model,value:value*80,currency:'USD'},usdReview=research(8e13,8e13);usdReview.valuation.currency='USD';usdReview.valuation.returnProjection.valuationBasis.currency='USD';const usd=returnPotential(price*80,usdModel,bindReturnBasis(usdReview,usdModel),'USD');
 assert(Math.abs(x.scenarios[1].cagr!-usd.scenarios[1].cagr!)<1e-10);assert.equal(x.passes,value>=price*Math.pow(1.15,5));
 const capped=buyCeiling(10000,model,x.ceiling);assert(capped.ceiling!<=model.value&&capped.ceiling!<=x.ceiling!);if(capped.ceiling!>0)assert(returnPotential(capped.ceiling,model,bindReturnBasis(research(1e12,1e12),model),'INR').passes,'The advertised entry ceiling must itself meet 15%');
}
// Independently verify the rolled model's present-value identity, including the unspent growth fade.
const model={value:1,inputs:{earningsPerShare:1,startGrowthPct:15,terminalGrowthPct:5,discountPct:12,rocePct:30}},cash:number[]=[];let e=1,pv=0;
for(let t=1;t<=10;t++){const g=.15+(.05-.15)*(t-1)/9;e*=1+g;cash.push(e*(1-g/.3));pv+=cash[t-1]/1.12**t;}
pv+=e*1.05*(1-.05/.3)/(.12-.05)/1.12**10;model.value=pv;
for(const years of [3,5] as const){const early=cash.slice(0,years).reduce((s,x,i)=>s+x/1.12**(i+1),0);assert(Math.abs(early+codeFutureValue(model,years)!/1.12**years-pv)<1e-9,'Future value must omit earlier distributions and must not restart high growth');}
const policy:any={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalReviews:{[ticker]:research(200,160)}};
assert.equal(fundamentalCheck(policy,ticker,100).status,'return');assert(!fundamentalCheck(policy,ticker,100).clear);
assert(!fundamentalCheck(policy,ticker).clear,'A missing entry price cannot approve a purchase');
assert(fundamentalCheck(policy,ticker,undefined,undefined,Date.now(),'business').clear,'The purchase return hurdle must not block a sound-company profit-sale review');
const missing=structuredClone(policy);missing.fundamentalReviews[ticker].valuation.returnProjection=null;assert.equal(fundamentalCheck(missing,ticker,50).status,'return-pending');
assert(fundamentalCheck(missing,ticker,undefined,undefined,Date.now(),'business').clear);
const raw:any=fundamentalFixture(),snapshot:any={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalScope:[{ticker,currency:'INR',statementPeriod:raw.statementPeriod}],fundamentalProfiles:{[ticker]:{website:'https://issuer.example'}}},checks=raw.sources.map((s:any)=>({ticker,url:s.url,reachable:true}));
let validated=validateFundamentals([raw],snapshot,checks)[0];assert(validated.valuation.returnProjection.sourceBacked);assert.equal(validated.valuation.returnProjection.asOf,validated.researchedAt);
raw.valuation.returnProjection.sourceIds=['invented'];raw.valuation.returnProjection.sourceBacked=true;validated=validateFundamentals([raw],snapshot,checks)[0];assert.equal(validated.valuation.returnProjection,null,'Unverified forecast metadata is discarded, even if the model claims it is verified');
console.log('PASS: 6,000 FX/price/ceiling states, exact 15% boundary, 3y/5y divergence, dated targets, no dividend leakage, model cash-flow identity, source authentication, unknown inputs and independent sale safeguards.');

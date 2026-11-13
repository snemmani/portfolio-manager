import assert from 'node:assert/strict';
import {returnPotential,codeFutureValue,RETURN_POLICY} from '../lib/return-potential';
import {fundamentalCheck,shortlistCheck,FUNDAMENTAL_POLICY} from '../lib/fundamental-policy';
import {validateFundamentals} from '../lib/fundamental-contract';
import {businessModel} from '../lib/business-model';
import {withFinancialAssumptions,fundamentalFixture,storedFundamental,bindReturnBasis} from './fundamental-fixture.mjs';
import {planDiscovery} from '../lib/discovery';
import {ruleIdeas} from '../lib/event-policy';
import {executionFromContext} from '../lib/execution-engine';
import {fundamentalScope} from '../lib/fundamental-store';
import {cashResearchCandidates} from '../lib/cash-research';
import {holdingStep} from '../lib/holding-steps';
import {mergeRecommendations} from '../lib/merge-recommendations';
const ticker='PFC.NS',bank={value:834.58,currency:'INR',method:'Justified P/B',inputs:{roePct:19.51,growthPct:5,discountPct:12,bookPerShare:402.6}},model=businessModel({ticker});
const r:any=storedFundamental(ticker,'INR',402.6,bank);r.valuation.baseValue=443;r.valuation.returnProjection=null;r.businessModelKey=model.reviewKey;r.policyVersion='materiality-v3';r.blockingReasons=[];r.warnings=[];
const c:any={ticker,status:'eligible',market:'IN',currency:'INR',price:341.15,quoteTime:Date.now()/1000,sector:'Financials',metrics:{statementDate:r.statementPeriod},scorecard:{policy:'jarvis-gates-v2',status:'eligible',summary:'Initial numerical checks pass.',gates:[],warnings:[],warningCount:0,businessModel:model,intrinsic:bank}};
const p={name:'Test',value:10000,cash:5000,complete:true},h:any={...c,action:'Add candidate',portfolio:p.name,value:500,shares:2,avg:400,fx:1,reasons:[],fundamentals:{date:r.statementPeriod},quote:{time:Date.now()/1000,stale:false}};
const policy:any={rulesBased:true,fundamentalPolicy:FUNDAMENTAL_POLICY,asOf:new Date().toISOString(),candidates:[c],fundamentalReviews:{[ticker]:r},events:{[ticker]:{ok:true,checkedAt:new Date().toISOString(),issues:[],fingerprint:'clear'}},combinedTotal:p.value};
const tech:any={currency:'INR',price:341.15,quoteTime:Date.now()/1000-10,lastBarTime:Date.now()/1000-300,sessionStart:Date.now()/1000-3600,sessionEnd:Date.now()/1000+3600,atr14:2,trend:'rising',rsi14:50,sma20:340,sma50:338,sma200:330,vwap:340,levels:{pivot:340,s1:338,s2:337,low20:335,sessionLow:338,r1:350,r2:360,high20:365,sessionHigh:350},sessionOpen:true,fresh:true,sufficient:true,largeGap:false,reasons:[]};
const context:any={snap:{holdings:[h],portfolios:[p],totals:{value:p.value},buyGates:{}},rulesBased:true,report:null,live:{discovery:policy,ideas:[]}};
for(const price of [1,100,281.1,341.15,402.6,800]){
 const result=fundamentalCheck(policy,ticker,price);assert.equal(result.status,'return-reconciliation');assert(!result.clear&&!result.returnPotential?.known);assert.equal(result.valuation?.ceiling,null);
 assert(!shortlistCheck(policy,{...c,price}).qualified,'A cheaper price cannot clear unreconciled assumptions');
}
assert(Math.abs(returnPotential(c.price,bank,r,'INR').diagnostics[1].cagr!-.2557229121674969)<1e-9,'The old 25.6% result survives only as a clearly unreviewed diagnostic');
assert.equal(holdingStep(h,policy).state,'return-reconciliation');assert.equal(ruleIdeas([p],policy)[0].decision,'watch');assert.equal(planDiscovery(p,[h],1000,'India',policy,[]).allocations.length,0);
let ex=executionFromContext(context,tech,{ticker,portfolio:p.name});assert(!ex.plan.authorized&&!ex.plan.canDraft);assert.match(ex.plan.decisionReason,/reconciliation/);assert.equal(ex.returnPotential.entryPrice,ex.plan.limit,'Displayed CAGR uses the same entry as the final limit check');
const merged=mergeRecommendations([h],[{portfolio:p.name,ticker,action:'buy',reasons:['Saved optimistic report']}],{...policy,rulesBased:false});assert.equal(merged[0].action,'Review','A saved AI buy cannot contradict the current return gate');
assert(fundamentalCheck(policy,ticker,undefined,undefined,Date.now(),'business').clear,'An unresolved purchase forecast is not a selling/outlook blocker');
// Use the real normaliser, not a self-certified reconciliation flag.
const raw:any=fundamentalFixture(ticker);raw.valuation={...raw.valuation,currency:'INR',baseValue:443,maxEntry:402.6,bearValue:281.82,bullValue:603.9,returnProjection:{...raw.valuation.returnProjection,scenario:'base',baseValueNow:443,codeValueNow:834.58,year3Value:443*1.05**3,year5Value:443*1.05**5,year3BearValue:350,year3BullValue:650,year5BearValue:400,year5BullValue:800,reconciliation:'The 1.10x book base case retains a credit-risk discount to the theoretical 2.07x code multiple; 5% retained-book growth funds the future targets.'}};
raw.valuation.returnProjection.epsNow=402.6*.1951;raw.valuation.returnProjection.year5Eps=raw.valuation.returnProjection.epsNow*1.05**5;raw.valuation.returnProjection.exitPe=raw.valuation.returnProjection.year5Value/raw.valuation.returnProjection.year5Eps;withFinancialAssumptions(raw,bank);
const snap:any={fundamentalPolicy:FUNDAMENTAL_POLICY,fundamentalScope:[{ticker,currency:'INR',businessModel:model,intrinsic:bank,statementPeriod:raw.statementPeriod}],fundamentalProfiles:{[ticker]:{website:'https://issuer.example'}}},checks=raw.sources.map((s:any)=>({ticker,url:s.url,reachable:true}));
let valid=validateFundamentals([raw],snap,checks)[0],at=Date.parse(valid.researchedAt);assert(valid.valuation.returnProjection);
const twice=validateFundamentals([valid],snap,checks)[0];assert(twice.valuation.returnProjection,'Runner-normalised forecasts must survive the server publication pass');assert.equal(twice.valuation.returnProjection.year5Value,valid.valuation.returnProjection.year5Value);assert.deepEqual(twice.valuation.returnProjection.valuationBasis,valid.valuation.returnProjection.valuationBasis);assert.equal(twice.returnWarnings.length,0);
const forged=structuredClone(valid);forged.valuation.returnProjection.baseValueNow=444;assert.equal(validateFundamentals([forged],snap,checks)[0].valuation.returnProjection,null,'Server rechecks anchors even when incoming metadata claims validation');
const reconciled={...policy,fundamentalReviews:{[ticker]:valid}};let result=fundamentalCheck(reconciled,ticker,341.15,undefined,at);assert.equal(result.status,'return');assert(Math.abs(result.returnPotential!.scenarios[1].cagr!-.1063205236788054)<1e-10);assert.equal(result.valuation?.ceiling,281.1);assert(result.returnPotential!.scenarios[1].basis?.includes('research'));
assert(fundamentalCheck(reconciled,ticker,281.1,undefined,at).clear,'A genuine reconciled base-case pass can qualify');
assert(returnPotential(100,{...bank,method:'Renamed display description'},valid,'INR',at).known,'A descriptive rename does not change the reviewed numeric model');
const later=returnPotential(341.15,bank,valid,'INR',at+86400000);assert.equal(later.scenarios[1].targetDate,result.returnPotential!.scenarios[1].targetDate,'No rolling target-date reset');
for(const key of ['baseValue','maxEntry']){const changed=structuredClone(valid);changed.valuation[key]+=1;assert(returnPotential(100,bank,changed,'INR',at).needsReconciliation);}
for(const changed of [{...bank,value:835},{...bank,inputs:{...bank.inputs,growthPct:6}},{...bank,binding:false},{...bank,currency:'USD'},null])assert(returnPotential(100,changed,valid,'INR',at).needsReconciliation,'Changed or removed code inputs require a new captured reconciliation');
const legacy=structuredClone(valid);legacy.valuation.returnProjection.version='price-cagr-v1';assert(!returnPotential(1,bank,legacy,'INR',at).known,'Legacy projections cannot certify the new policy');
for(const mutate of [(x:any)=>x.valuation.returnProjection.scenario='bull',(x:any)=>x.valuation.returnProjection.year5BearValue=1000,(x:any)=>x.valuation.returnProjection.codeValueNow=402.6,(x:any)=>x.valuation.returnProjection.baseValueNow=444,(x:any)=>x.valuation.returnProjection.sourceIds=['forged']]){
 const bad=structuredClone(raw);mutate(bad);const v=validateFundamentals([bad],snap,checks)[0];assert.equal(v.valuation.returnProjection,null,'Invalid scenario, anchors or evidence cannot self-certify a return');if(v.blockingReasons.length)assert.equal(v.decision,'incomplete');else assert.equal(v.decision,'supported','Return-only gaps preserve the business review');assert(v.returnWarnings.length>0);assert(!v.warnings.some((w:string)=>w.includes('forward base-case')),'Return validation does not count as a business/selling warning');
}
const partlyChecked=validateFundamentals([raw],snap,checks.filter((c:any)=>!c.url.includes('results')))[0];assert.equal(partlyChecked.valuation.returnProjection,null,'One reachable reference cannot certify a forecast also citing unverified sources');
const mismatch={...reconciled,candidates:[{...c,currency:'USD'}]};assert.equal(fundamentalCheck(mismatch,ticker,100).status,'incomplete','A matching projection currency cannot hide a mismatched trading currency');
// Opposite direction: a research forecast cannot relax an existing conservative code limit.
const optimistic=structuredClone(valid);optimistic.valuation.returnProjection.year3Value=1000;optimistic.valuation.returnProjection.year5Value=1900;optimistic.valuation.returnProjection.year5Eps=1900/optimistic.valuation.returnProjection.exitPe;optimistic.valuation.returnProjection.year3BullValue=null;optimistic.valuation.returnProjection.year5BullValue=null;
const constrained=returnPotential(100,bank,optimistic,'INR',at);assert.equal(constrained.scenarios[1].targetValue,codeFutureValue(bank,5));assert.equal(constrained.scenarios[0].targetValue,codeFutureValue(bank,3),'One model is used for both horizons');
// Direction, scale and price cannot turn an absent reconciliation into purchase authority.
for(let i=1;i<=8000;i++){
 const code={...bank,value:10+i/9},review=structuredClone(r);review.valuation.baseValue=5+i/17;
 const x=returnPotential(i/11,code,review,'INR');assert(!x.known&&!x.passes&&x.ceiling===null);
 const accepted=bindReturnBasis(structuredClone(valid),code);accepted.valuation.returnProjection.valuationBasis.baseValue=accepted.valuation.baseValue;
 const y=returnPotential(i/11,code,accepted,'INR',at);if(y.passes){assert(y.known);assert(y.scenarios[1].targetValue!>=i/11*1.15**5);assert(y.ceiling!<=Math.min(accepted.valuation.returnProjection.year5Value,codeFutureValue(code,5)!)/1.15**5);}
}
const recentAttempt=structuredClone(r),legacyAttempt=structuredClone(r);delete legacyAttempt.returnPolicyVersion;
const ss={holdings:[h],portfolios:[p],fx:85};
assert.equal(fundamentalScope(ss,policy,{[ticker]:recentAttempt}).length,0,'A new-policy attempt retains its 24-hour retry delay');
assert.equal(fundamentalScope(ss,policy,{[ticker]:legacyAttempt})[0].ticker,ticker,'A changed forward-return policy reopens a legacy holding forecast at the next slot');
assert(cashResearchCandidates({...ss,holdings:[]},policy,{[ticker]:legacyAttempt})[0].researchDue);
assert(!cashResearchCandidates({...ss,holdings:[]},policy,{[ticker]:recentAttempt})[0].researchDue);
assert(!cashResearchCandidates({...ss,holdings:[]},policy,{[ticker]:{...legacyAttempt,decision:'reject'}})[0].researchEligible,'Rejected businesses do not receive forward-return refreshes');
assert.equal(RETURN_POLICY.version,'total-return-v3');
console.log('PASS: PFC production-shaped regression, code/research disagreements in both directions, 8,000 property states, source-normalised reconciliation, base-only ordering, unchanged sale eligibility, frozen dates, changed anchors/models/currencies, cash/shortlist/execution and non-rules recommendation enforcement.');

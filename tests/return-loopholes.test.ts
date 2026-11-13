import assert from 'node:assert/strict';
import {returnPotential,codeFutureValue,RETURN_POLICY} from '../lib/return-potential';
import {codeModelKey} from '../lib/return-basis.mjs';
import {intrinsicValue} from '../lib/jarvis-gates';
import {fundamentalScope} from '../lib/fundamental-store';
import {cashResearchCandidates} from '../lib/cash-research';
import {validateFundamentals} from '../lib/fundamental-contract';
import {withFinancialAssumptions,storedFundamental,bindReturnBasis,fundamentalFixture} from './fundamental-fixture.mjs';
const T='C.NS',op={value:100,currency:'INR',inputs:{earningsPerShare:10,startGrowthPct:12,terminalGrowthPct:5,discountPct:11,rocePct:20}};
function review(intr:any,y5=300,y3=200,researchedAt=Date.now()){const r:any=storedFundamental(T,'INR',90,intr),at=new Date(researchedAt).toISOString();Object.assign(r,{researchedAt:at,expiresAt:new Date(Date.now()+60*864e5).toISOString(),policyVersion:'materiality-v3',blockingReasons:[]});Object.assign(r.valuation.returnProjection,{asOf:at,epsNow:y5/60,year5Eps:y5/60,year5Value:y5,year3Value:y3,year5BullValue:null,year3BullValue:null});return withFinancialAssumptions(bindReturnBasis(r,intr));}

// 1. A reconciled, passing cash candidate (model under scorecard.intrinsic) is not re-researched daily.
{const r=review(op,300,200,Date.now()-30*3600e3),cand={ticker:T,name:'C',currency:'INR',price:50,status:'eligible',sector:'Industrials',industry:'Machinery',scorecard:{intrinsic:op},metrics:{}};
 assert(returnPotential(50,op,r,'INR').passes);
 const snap:any={holdings:[],portfolios:[{name:'P',complete:true,cash:1e6,value:1e7}],fx:83};
 assert.deepEqual(fundamentalScope(snap,{candidates:[cand]},{[T]:r},undefined,2,[],{}).map((s:any)=>s.ticker),[],'scheduled run must not repeat current research');
 assert.deepEqual(fundamentalScope(snap,{candidates:[cand]},{[T]:r},undefined,2,[],{intent:'deploy-cash',portfolio:'P',market:'India'}).map((s:any)=>s.ticker),[],'deploy-cash must not repeat current research');
 // Newer statements on the candidate still force a refresh.
 assert.deepEqual(fundamentalScope(snap,{candidates:[{...cand,metrics:{statementDate:'2999-03-31'}}]},{[T]:r},undefined,2,[],{}).map((s:any)=>s.ticker),[T]);}

// 2. FX movement does not invalidate a reconciled forecast; a changed statement model still does.
{const fx=(rate:number,eps=1)=>({...op,value:Math.round(1.2*rate*100)/100,statementValue:1.2,statementCurrency:'USD',inputs:{...op.inputs,earningsPerShare:eps}});
 const r=review(fx(83));
 for(const rate of [82,83.4,85,90])assert(returnPotential(50,fx(rate),r,'INR').known,'FX tick '+rate);
 assert(!returnPotential(50,fx(83,2),r,'INR').known,'changed statement inputs invalidate the forecast');
 assert(!returnPotential(50,{...fx(83),statementValue:1.3},r,'INR').known,'changed statement value invalidates the forecast');
 // Unconverted models keep their historical key (stored reviews remain valid).
 assert.equal(codeModelKey(op),JSON.stringify({value:100,currency:'INR',binding:true,inputs:Object.fromEntries(Object.entries(op.inputs).sort(([a],[b])=>a.localeCompare(b)))}));}

// 3. Every binding engine model can be rolled forward; an unrollable binding model fails closed.
{let n=0;for(const market of ['IN','US'] as const)for(const fin of [true,false])for(let a=0;a<3000;a++){
  const m:any={revenueCagr:(a*7919%1000)/10-20,earningsCagr:(a*104729%1000)/10-20,roeMedian:(a*31%600)/10,bookPerShare:1+a%500,eps:.01+a%50,roceMedian:(a*13%1200)/10};
  const iv=intrinsicValue(m,market,fin);if(!iv)continue;n++;assert(codeFutureValue(iv,5)!==null&&codeFutureValue(iv,3)!==null,JSON.stringify(iv.inputs));}
 assert(n>5000);
 const bad={...op,inputs:{...op.inputs,startGrowthPct:35}},x=returnPotential(50,bad,review(bad,1000,600),'INR');
 assert(x.codeUnsupported&&!x.known&&!x.passes,'research alone cannot qualify when the binding code model cannot cross-check it');
 assert(returnPotential(50,{...bad,binding:false},review({...bad,binding:false},300,200),'INR').passes,'indicative models remain research-only');
 const cand={ticker:T,currency:'INR',price:50,status:'eligible',scorecard:{intrinsic:bad},metrics:{}};
 assert(!cashResearchCandidates({holdings:[],portfolios:[{name:'P',complete:true,cash:1e6,value:1e7}],fx:83},{candidates:[cand]},{},{})[0].researchEligible,'no AI research spent on an unrollable model');}

// 4. Forecasts implying more than 35%/yr from today's base value are rejected, in the gate and the contract.
{const base=108,limit5=base*Math.pow(1+RETURN_POLICY.maxForecastCagr,5);
 assert(returnPotential(50,null,review(null,limit5,200),'INR').known,'boundary accepted');
 for(const y5 of [limit5*1.001,base*1000])assert(!returnPotential(50,null,review(null,y5,200),'INR').known,'absurd five-year forecast '+y5);
 assert(!returnPotential(50,null,review(null,300,base*Math.pow(1.35,3)*1.01),'INR').known,'absurd three-year forecast');
 const raw:any=fundamentalFixture(T,'INR');raw.valuation.returnProjection.year5Value=raw.valuation.baseValue*1000;
 const snapshot:any={fundamentalPolicy:'investor-v1',fundamentalScope:[{ticker:T,currency:'INR',statementPeriod:raw.statementPeriod}],fundamentalProfiles:{[T]:{website:'https://issuer.example'}}};
 const [out]=validateFundamentals([raw],snapshot,raw.sources.map((s:any)=>({ticker:T,url:s.url,reachable:true})));
 assert.equal(out.valuation.returnProjection,null);assert(out.returnWarnings.length);}
console.log('PASS: cash-candidate freshness, FX-stable model identity, unrollable binding models fail closed, forecast growth bound in gate and contract.');

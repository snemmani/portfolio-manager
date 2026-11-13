import assert from 'node:assert/strict';
import {holdingStep,withHoldingSteps} from '../lib/holding-steps';
import {storedFundamental} from './fundamental-fixture.mjs';
const h:any={ticker:'AAA.NS',portfolio:'Test',action:'Add candidate',price:100,value:1000,quote:{stale:false},fundamentals:{date:'2026-03-31'},reasons:['Numerical screen passed.']};
const r:any=storedFundamental(h.ticker,'INR',150);r.policyVersion='materiality-v3';r.blockingReasons=[];r.warnings=[];
const policy:any={fundamentalPolicy:'investor-v1',fundamentalReviews:{[h.ticker]:r},events:{[h.ticker]:{ok:true,checkedAt:new Date().toISOString(),issues:[]}},annualDocumentsAvailable:true};
const snap={holdings:[h],portfolios:[{name:'Test',complete:true}],totals:{value:10000}};
assert.equal(holdingStep(h,null).label,'Checking next step…');assert.equal(holdingStep(h,{unavailable:true}).label,'Review status unavailable');
assert.equal(holdingStep(h,{...policy,annualDocumentsAvailable:false}).label,'Report library unavailable');
assert.equal(holdingStep(h,{...policy,fundamentalReviews:{}}).label,'Company research pending');
assert.equal(holdingStep(h,{...policy,current:{status:'running',scope:[h.ticker]}}).label,'Company review running');
assert.equal(holdingStep(h,{...policy,current:{status:'queued',scope:[h.ticker]}}).label,'Company review queued');
const failed={...policy,fundamentalReviews:{[h.ticker]:{...r,decision:'incomplete',sources:[],gaps:['The research attempt failed or exceeded its time limit. No investment case was established.']}}};
assert.equal(holdingStep(h,failed).label,'Company review needs retry');
assert.equal(holdingStep(h,{...failed,current:{status:'running',scope:[h.ticker]}}).label,'Company review running','The current retry takes precedence over the previous failed attempt');
assert.equal(holdingStep(h,{...policy,fundamentalReviews:{[h.ticker]:{...r,blockingReasons:['Annual-report figures are not substantiated.'],decision:'incomplete'}}}).label,'Evidence incomplete');
assert.equal(holdingStep(h,{...policy,fundamentalReviews:{[h.ticker]:{...r,blockingReasons:['Valuation still needs source-backed analysis.'],decision:'incomplete'}}}).label,'Valuation incomplete');
assert.equal(holdingStep(h,{...policy,fundamentalReviews:{[h.ticker]:{...r,decision:'reject'}}}).label,'Case not supported');
assert.equal(holdingStep(h,{...policy,fundamentalReviews:{[h.ticker]:{...r,expiresAt:'2020-01-01'}}}).label,'Research update needed');
assert.equal(holdingStep({...h,price:200},policy).label,'Waiting for entry price','Completed research above entry is not labelled as missing research');
assert.equal(holdingStep(h,policy,snap).label,'Trade checks pending');
assert.equal(holdingStep(h,{...policy,events:{}},snap).label,'Company event check pending');
assert.equal(holdingStep({...h,buyGate:{allowed:false,reasons:['Wait after the recorded sale.']}},policy,snap).label,'Re-entry conditions pending');
assert.equal(holdingStep(h,policy,{...snap,portfolios:[{complete:false}]}).label,'Price / records need refresh');
assert.equal(holdingStep({...h,nonDiscretionary:true},policy).label,'Locked');
const before=JSON.stringify(snap),display=withHoldingSteps(snap,policy);assert.equal(JSON.stringify(snap),before);assert.equal(display.holdings[0].action,h.action);assert.equal(display.holdings[0].purchaseStep.label,'Trade checks pending');
for(let i=0;i<4000;i++){
 const price=i/10+.1,held={...h,price,portfolio:'P'+i},x=withHoldingSteps({...snap,holdings:[held]},policy).holdings[0];
 assert.equal(x.action,'Add candidate');assert.equal(x.price,price);assert.equal(x.value,h.value);// Five-year base case 750: above 750/1.15^5 (372.88) the return hurdle fails before the valuation wait.
 assert.equal(x.purchaseStep.label,price<=150?'Trade checks pending':price>372.89?'Below 15% return hurdle':'Waiting for entry price');
 assert(!('authorized' in x.purchaseStep)&&!('canDraft' in x.purchaseStep),'Labels never grant trading authority');
}
console.log('PASS: 4,000 price/readiness states, missing/incomplete/expired/queued/running research, price-only waits, event/cooldown/data blocks and immutable execution actions.');

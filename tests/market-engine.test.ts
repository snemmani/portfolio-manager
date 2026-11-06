import assert from 'node:assert/strict';
import {storedFundamental} from './fundamental-fixture.mjs';
import {executionFromContext} from '../lib/execution-engine';
const now=Date.now()/1000;
const stock={ticker:'NEW',market:'US',currency:'USD',status:'eligible',category:'A',sector:'Technology',price:100,quoteTime:now,matchedScreens:[{bucket:'Tech',criteria:'Rev Growth>8% · ROCE>12% · LT D/E<1'}],metrics:{revenue_growth_yoy:20,earnings_growth_yoy:20,roe:25,roce:20,longTermDebtEquity:.2},gateReasons:[]};
const portfolio={name:'P',value:100000,cash:50000,complete:true};
const event={ok:true,checkedAt:new Date().toISOString(),issues:[],fingerprint:'clear'};
const frame:any={rulesBased:true,snap:{asOf:new Date().toISOString(),holdings:[],portfolios:[portfolio],totals:{value:100000},buyGates:{}},report:null,live:{discovery:{asOf:new Date().toISOString(),fx:80,householdComplete:true,rulesBased:true,fundamentalPolicy:'investor-v1',fundamentalReviews:{NEW:storedFundamental('NEW','USD')},candidates:[stock],events:{NEW:event},eventAcks:{},buyGates:{}},ideas:[{ticker:'NEW',portfolio:'P',decision:'enter',market:'US',conviction:'low',targetWeightPct:5,thesis:'Rules pass.'}]}};
const t={recentCloses:[100,100,100],regime:'transition',swingSupport:97,price:100,currency:'USD',quoteTime:now,sessionStart:now-3600,sessionEnd:now+3600,sessionOpen:true,fresh:true,sufficient:true,largeGap:false,lastBarTime:now-600,atr14:2,rsi14:50,trend:'rising',sma20:97,sma50:103,sma200:104,vwap:98,levels:{pivot:97,s1:96,s2:95,low20:90,sessionLow:95,r1:105,r2:110,high20:110,sessionHigh:101},reasons:[]};
const before=JSON.stringify(frame);let plan=executionFromContext(frame,t,{ticker:'NEW',portfolio:'P'});assert(plan.plan.canDraft);assert(plan.plan.quantity>0);assert(plan.plan.quantity*plan.plan.limit*80<=5000);assert.equal(JSON.stringify(frame),before,'Sizing never mutates the shared review frame');
for(let i=0;i<1000;i++){
 const cash=i%13===0?0:10+i*43,complete=i%17!==0,fx=i%19===0?null:80;
 const f=structuredClone(frame);f.snap.portfolios[0]={...portfolio,cash,complete};f.live.discovery.fx=fx;
 if(i%23===0)f.live.discovery.events.NEW={...event,ok:false};
 if(i%29===0)f.snap.buyGates[JSON.stringify(['P','NEW'])]={allowed:false,reasons:['Recorded sale cooldown']};
 const d=executionFromContext(f,t,{ticker:'NEW',portfolio:'P'});
 if(d.plan.canDraft){assert(complete&&fx&&cash>0);assert(d.plan.quantity*d.plan.limit*fx<=cash+1e-7);assert(d.plan.quantity*d.plan.limit*fx<=5000+1e-7);assert(i%23!==0&&i%29!==0);}
}
for(const change of [{sessionEnd:now-1},{quoteTime:now-1300},{lastBarTime:now-1800}])assert(!executionFromContext(frame,{...t,...change},{ticker:'NEW',portfolio:'P'}).plan.canDraft);
assert(!executionFromContext({...frame,expiresAt:'2000-01-01'},t,{ticker:'NEW',portfolio:'P'}).plan.canDraft);
assert.equal(executionFromContext(frame,t,{ticker:'UNKNOWN',portfolio:'P'}).httpStatus,404);
console.log('PASS: pure shared-frame execution, immutable sizing, 1,000 cash/FX/portfolio/event/cooldown cases, session close, stale quotes/bars, expiry and unknown-stock safeguards.');

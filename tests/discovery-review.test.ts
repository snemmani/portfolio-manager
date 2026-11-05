import assert from 'node:assert/strict';
import {candidateReview,discoveryCoverage,recheckCandidate} from '../lib/discovery-review';
import {tradeSummary} from '../lib/trade-summary';
import {planDiscovery} from '../lib/discovery';
const c={ticker:'NEW.NS',market:'IN',currency:'INR',status:'eligible',price:111,quoteTime:Date.now()/1000,sector:'Technology',category:'A',metrics:{revenue_growth_yoy:6.6,roe:20},matchedScreens:[{bucket:'Technology',criteria:'ROE>15% · Rev Growth>8%'}]};
assert.equal(candidateReview(c,'Test',[]).state,'pending');assert.match(candidateReview(c,'Test',[]).reasons[0],/has not been completed/);
const reviewed=[{ticker:c.ticker,portfolio:'Other',decision:'enter'}];assert.equal(candidateReview(c,'Test',reviewed).state,'pending','Approval in another portfolio cannot transfer');
const checked=recheckCandidate(c);assert.equal(checked.status,'watchlist');assert(checked.gateReasons.some((s:string)=>s.includes('6.6%')&&s.includes('8%')));
assert.equal(recheckCandidate({...c,metrics:{revenue_growth_yoy:10,roe:20}}).status,'eligible');assert.equal(recheckCandidate({...c,status:'rejected'}).status,'rejected');
const ideas=[{portfolio:'Test',ticker:c.ticker,decision:'enter',market:'IN',conviction:'low',targetWeightPct:5,thesis:'Fits the portfolio.'}];
assert.deepEqual(discoveryCoverage([c],'Test',[]),{screened:1,eligible:1,reviewed:0,pending:1,approved:0,sized:0});
const p={name:'Test',cash:1000,value:10000,complete:true};const d={asOf:new Date().toISOString(),candidates:[c]};
assert.equal(planDiscovery(p,[],1000,'India',d,[]).allocations.length,0,'No fabricated approval when review missing');
const plan=planDiscovery(p,[],1000,'India',d,ideas);assert.equal(plan.allocations[0].quantity,4);assert.equal(plan.allocations[0].amount,444);assert(plan.allocations[0].amount<500,'Low-conviction 3–5% rule permits whole-share rounding below 5%');
assert.equal(planDiscovery(p,[],1000,'India',d,[{...ideas[0],conviction:'medium'}]).allocations[0].quantity,4,'A nominal 5% target uses the implementable whole-share minimum without exceeding its cap');

const base={plan:{side:'sell',authorized:true,quantity:8,limit:1541.3,canDraft:true,validUntil:new Date(Date.now()+60000).toISOString(),status:'Ready'},technical:{currency:'INR',sessionOpen:true,quoteTime:Date.now()/1000}};
assert.equal(tradeSummary(base,'sell').show,true);assert.equal(tradeSummary(base,'sell').quantity,8);assert.equal(tradeSummary(base,'sell').ready,true);
assert.equal(tradeSummary({...base,plan:{...base.plan,authorized:false}},'sell').show,false);
assert.equal(tradeSummary(base,'buy').show,false,'A changed sell plan is never shown as a buy');
assert.equal(tradeSummary({...base,plan:{...base.plan,canDraft:false},technical:{...base.technical,sessionOpen:false}},'sell').label,'Market closed — preview');
assert.match(tradeSummary({...base,plan:{...base.plan,validUntil:'2000-01-01'}},'sell').label||'',/expired/);
assert.equal(tradeSummary({...base,plan:{...base.plan,quantity:0}},'sell').show,false);
console.log('PASS: missing portfolio coverage, screen/company conflicts, no unreviewed buys, valid approved entries, low-conviction rounding, inline share/limit display and stale/closed/unauthorized safeguards.');

const own={portfolio:'Test',ticker:'OLD.NS',action:'Add candidate',currency:'INR',value:500,aggregateValue:500,price:100,fx:1,quote:{time:Date.now()/1000},sector:'Technology',category:'B',reasons:['Growth passes.']};
assert.equal(planDiscovery(p,[own],1000,'India',{...d,holdingRecommendations:[],reportAsOf:new Date().toISOString()},[]).allocations.length,0);
const addPlan=planDiscovery(p,[own],1000,'India',{...d,holdingRecommendations:[{portfolio:'Test',ticker:'OLD.NS',action:'buy',confidence:'medium',reasons:['Growth passes.']}],reportAsOf:new Date().toISOString()},[]);
assert.equal(addPlan.allocations[0].ticker,'OLD.NS');assert.equal(addPlan.allocations[0].quantity,5);

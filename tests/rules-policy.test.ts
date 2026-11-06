import assert from 'node:assert/strict';
import {eventSafety,ruleIdeas} from '../lib/event-policy';
import {planDiscovery} from '../lib/discovery';
import {mergeRecommendations} from '../lib/merge-recommendations';
import {marketHours} from '../lib/research-schedule';
import {recheckCandidate} from '../lib/discovery-review';
import {storedFundamental} from './fundamental-fixture.mjs';
const event={ok:true,checkedAt:new Date().toISOString(),issues:[],fingerprint:'clear'};
assert(eventSafety(event).clear);assert(!eventSafety(null).clear);assert(!eventSafety({...event,ok:false},'clear').clear);assert(!eventSafety({...event,checkedAt:'2000-01-01'}).clear);
const flagged={...event,issues:['Possible regulatory investigation'],fingerprint:'event1'};assert(!eventSafety(flagged).clear);assert(eventSafety(flagged,'event1').clear);assert(!eventSafety({...flagged,fingerprint:'event2'},'event1').clear);
const p={name:'Test',value:10000,cash:5000,complete:true},h={ticker:'AAA.NS',portfolio:'Test',action:'Add candidate',currency:'INR',value:500,price:100,fx:1,sector:'Technology',category:'B',quote:{time:Date.now()/1000},reasons:['Revenue and earnings growth exceed 15%.'],risks:[]};
// Purchases need the company-review policy; without it the check fails closed.
const d={rulesBased:true,asOf:new Date().toISOString(),candidates:[],events:{'AAA.NS':event},eventAcks:{},combinedTotal:10000,fundamentalPolicy:'investor-v1',fundamentalReviews:{'AAA.NS':storedFundamental('AAA.NS'),'NEW.NS':storedFundamental('NEW.NS')}};
assert.equal(planDiscovery(p,[h],1000,'India',{...d,fundamentalPolicy:undefined},[]).allocations.length,0,'A missing review policy fails closed');
assert.equal(planDiscovery(p,[h],1000,'India',d,[]).allocations[0].quantity,5,'Existing-stock add sizes from the rules and the stored company review');
assert.equal(planDiscovery(p,[h],1000,'India',{...d,events:{}},[]).allocations.length,0,'Missing event coverage blocks buys');
assert.equal(planDiscovery(p,[h],1000,'India',{...d,events:{'AAA.NS':flagged}},[]).allocations.length,0);
assert.equal(mergeRecommendations([h],[{portfolio:'Test',ticker:'AAA.NS',action:'hold',reasons:['Advisory hold.'],risks:[]}],d)[0].action,'Buy','AI opinion is not a numerical buy gate');
assert.equal(mergeRecommendations([h],[],{...d,events:{}})[0].action,'Review');
const c={ticker:'NEW.NS',status:'eligible',market:'IN',currency:'INR',price:100,quoteTime:Date.now()/1000,category:'B',sector:'Technology',metrics:{roe:20,revenue_growth_yoy:20,earnings_growth_yoy:20,pe_ttm:20,peg:1},matchedScreens:[{criteria:'P/E<50 · ROE>15% · Rev Growth>15% · NI Growth>15% · PEG<1.5',bucket:'General GARP'}]};
assert.equal(recheckCandidate(c,true).status,'eligible');assert.equal(recheckCandidate({...c,metrics:{...c.metrics,peg:null}},true).status,'watchlist','Unknown numeric screen data cannot pass');
const discovery={...d,candidates:[c],events:{'NEW.NS':event}};const ideas=ruleIdeas([p],discovery);assert.equal(ideas[0].source,'rules');assert.equal(ideas[0].decision,'enter');assert.equal(planDiscovery(p,[],1000,'India',discovery,ideas).allocations[0].quantity,5);
assert(marketHours(Date.parse('2026-11-04T09:30:00+05:30')));assert(marketHours(Date.parse('2026-11-04T10:00:00-05:00')));assert(!marketHours(Date.parse('2026-11-07T10:00:00+05:30')));
console.log('PASS: AI-independent existing/new buys, current event coverage, explicit event review, no stale/unknown bypass, numerical screen completeness, research advisory role and market sessions.');

const roundedDiscovery={...discovery,candidates:[{...c,price:113}]};const roundedIdeas=[{...ideas[0],conviction:'medium',targetWeightPct:5}];const rounded=planDiscovery(p,[],1000,'India',roundedDiscovery,roundedIdeas);assert.equal(rounded.allocations[0].quantity,4,'A 5% target may round down to four whole shares without being rejected by a 5% nominal minimum');assert(rounded.allocations[0].amount<=p.value*.05);assert.equal(planDiscovery(p,[],300,'India',roundedDiscovery,roundedIdeas).allocations.length,0,'Insufficient cash is still a blocker');

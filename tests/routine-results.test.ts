import assert from 'node:assert/strict';
import {eventSafety,eventSafetyFor,ruleIdeas} from '../lib/event-policy';
import {storedFundamental} from './fundamental-fixture.mjs';
import {planDiscovery} from '../lib/discovery';
// Jarvis event gate: only serious red flags pause buying; routine news is a warning.
const now=Date.now(),title='Example (Q2 2027) Earnings Call Highlights: Revenue Growth',r:any=storedFundamental('NEW.NS','INR',150);r.eventFingerprint='same';r.sources.find((s:any)=>s.kind==='results').publishedAt=new Date(now-2*86400000).toISOString();
const event:any={ok:true,checkedAt:new Date(now).toISOString(),issues:['Possible material news: '+title],headlines:[{title,publishedAt:new Date(now-86400000).toISOString()}],fingerprint:'same'};
const d:any={rulesBased:true,fundamentalPolicy:'investor-v1',fundamentalReviews:{'NEW.NS':r},events:{'NEW.NS':event},asOf:new Date(now).toISOString(),candidates:[{ticker:'NEW.NS',status:'eligible',currency:'INR',market:'IN',price:100,quoteTime:now/1000,category:'A',sector:'Technology'}]};
const routine=eventSafety(event);assert(routine.clear,'A routine results headline is a warning, not a pause');assert.equal(routine.status,'warning');assert(routine.warnings.some((w:string)=>w.includes('Earnings Call')));
const p={name:'Test',value:10000,cash:2000,complete:true},ideas=ruleIdeas([p],d);assert.equal(ideas[0].decision,'enter');assert(planDiscovery(p,[],2000,'India',d,ideas).allocations.length,'Research, allocation and execution use the same event policy');

// Still clear: coverage within 24 hours, results/dividend calendar notices, ordinary headlines.
for(const change of [(e:any)=>e.checkedAt=new Date(now-31*60000).toISOString(),(e:any)=>e.issues.push('Results expected within 14 days: 2027-01-10'),(e:any)=>e.issues.push('Ex-dividend event within 7 days: 2027-01-03'),(e:any)=>e.issues.push('Possible material news: Buy, Sell, or Hold? Top Upgrades and Downgrades'),(e:any)=>e.fingerprint='new']){const e=structuredClone(event);change(e);assert(eventSafetyFor({...d,events:{'NEW.NS':e}},'NEW.NS').clear,JSON.stringify(e.issues))}
// Blocked: stale or failed coverage and serious red flags.
for(const change of [(e:any)=>e.checkedAt=new Date(now-25*3600000).toISOString(),(e:any)=>e.ok=false,(e:any)=>e.issues[0]='Possible material news: Example earnings call highlights: fraud investigation',(e:any)=>e.issues.push('Possible material news: Auditor resigns citing governance concerns'),(e:any)=>e.issues.push('Possible material news: Promoter pledge invoked by lenders')]){const e=structuredClone(event);change(e);assert(!eventSafetyFor({...d,events:{'NEW.NS':e}},'NEW.NS').clear,JSON.stringify(e.issues))}
const calendar={...event,coverageVersion:2,news:{ok:true,checkedAt:new Date(now).toISOString()},calendar:{ok:false,checkedAt:new Date(now).toISOString()}};assert(!eventSafetyFor({...d,events:{'NEW.NS':calendar}},'NEW.NS').clear);
// An explicit acknowledgement of the exact serious-event fingerprint clears that pause.
const serious={...event,issues:['Possible material news: unresolved investigation'],fingerprint:'same'};assert(!eventSafety(serious).clear);assert(eventSafety(serious,'same').clear,'Existing explicit event acknowledgements retain their established semantics');

// Review problems block buying through the research gate, not the event gate.
for(const change of [(x:any)=>x.expiresAt='2000-01-01',(x:any)=>x.decision='reject',(x:any)=>{x.valuation.maxEntry=0;}]){const x=structuredClone(r);change(x);assert.notEqual(ruleIdeas([p],{...d,fundamentalReviews:{'NEW.NS':x}})[0].decision,'enter')}
assert.notEqual(ruleIdeas([p],{...d,documentPolicy:'annual-reports-v1',annualDocumentsAvailable:false})[0].decision,'enter','An unavailable source library blocks purchases');
// A serious event after the review makes the review stale; ordinary headlines do not.
assert.notEqual(ruleIdeas([p],{...d,events:{'NEW.NS':{...serious,fingerprint:'later'}},eventAcks:{'NEW.NS':'later'}})[0].fundamentalStatus,'supported','A serious event after the review requires a refreshed case');
assert.equal(ruleIdeas([p],{...d,events:{'NEW.NS':{...event,fingerprint:'later'}}})[0].fundamentalStatus,'supported','A new ordinary headline does not invalidate the review');
// New quarterly results after the review make it stale.
assert.equal(ruleIdeas([p],{...d,events:{'NEW.NS':{...event,calendar:{ok:true,lastEarningsAt:new Date(now-3600000).toISOString()}}},fundamentalReviews:{'NEW.NS':{...r,researchedAt:new Date(now-2*86400000).toISOString()}}})[0].fundamentalStatus,'stale');
console.log('PASS: serious-only event pauses, 24-hour coverage, routine news/calendar as warnings, explicit acknowledgements, review staleness on serious events and new results, research-gate blocking.');

import assert from 'node:assert/strict';
import {isStale} from '../lib/engine';
import {quoteFreshness,exchangeSession} from '../lib/exchange-calendar';
import {marketHours} from '../lib/research-schedule';
const at=Date.parse,sec=(v:string)=>at(v)/1000;
// Actual incident: Monday close remains valid through Tuesday's exchange holiday and Wednesday pre-open.
for(const now of ['2026-11-10T12:00:00+05:30','2026-11-11T08:45:00+05:30','2026-11-11T09:44:59+05:30']){
 const f=quoteFreshness(sec('2026-11-09T15:28:22+05:30'),at(now));assert(!f.stale,now);assert.equal(f.expectedSession,'2026-11-09');
}
assert(isStale(sec('2026-11-09T15:28:22+05:30'),at('2026-11-11T09:45:00+05:30')));
assert(isStale(sec('2026-11-11T10:00:00+05:30'),at('2026-11-11T11:00:00+05:30')));
assert(!isStale(sec('2026-11-11T10:45:00+05:30'),at('2026-11-11T11:00:00+05:30')));
assert(isStale(sec('2026-11-06T15:28:00+05:30'),at('2026-11-11T08:45:00+05:30')));
assert.equal(exchangeSession('2026-11-10','INR'),null);assert(!marketHours(at('2026-11-10T11:00:00+05:30')));
assert(marketHours(at('2026-11-08T14:25:00+05:30')));assert(!marketHours(at('2026-11-08T14:00:00+05:30')));
// Muhurat Sunday's session must not be silently skipped.
assert(isStale(sec('2026-11-06T15:28:00+05:30'),at('2026-11-09T08:00:00+05:30')));
assert(!isStale(sec('2026-11-08T15:28:00+05:30'),at('2026-11-09T08:00:00+05:30')));
// New York local dates/DST, Thanksgiving and early close, not fixed UTC closing times.
assert(!isStale(sec('2026-11-25T15:59:00-05:00'),at('2026-11-26T18:00:00-05:00'),'USD'));
assert(!isStale(sec('2026-11-27T12:59:00-05:00'),at('2026-11-27T14:00:00-05:00'),'USD'));
assert(!marketHours(at('2026-11-27T14:00:00-05:00')));
assert(!isStale(sec('2026-07-06T15:59:00-04:00'),at('2026-07-06T16:45:00-04:00'),'USD'));
for(const v of [null,0,NaN,Infinity,sec('2026-11-12T10:00:00+05:30')])assert(isStale(v,at('2026-11-11T11:00:00+05:30')));
assert.equal(quoteFreshness(sec('2029-01-02T15:29:00+05:30'),at('2029-01-03T08:00:00+05:30')).calendarCovered,false);
// Every minute around the reopening: the holiday must not grant freshness during live trading.
for(let i=0;i<24*60;i++){
 const now=at('2026-11-11T00:00:00+05:30')+i*60000;
 assert.equal(isStale(sec('2026-11-09T15:28:00+05:30'),now),i>=585);
}
console.log('PASS: holiday incident, reopening, frozen intraday feed, Muhurat session, NY DST/early closes, future/missing times and 1,440 reopening boundary cases.');

assert(isStale(sec('2026-11-11T10:00:00+05:30'),at('2026-11-11T17:00:00+05:30')),'A frozen intraday quote cannot become fresh again after close');
assert(isStale(sec('2026-11-09T10:00:00+05:30'),at('2026-11-11T08:00:00+05:30')),'Previous-session morning quotes cannot stand in for closing-session prices');

// FX supports business-day portfolio conversion, not the equity intraday order policy.
assert(!quoteFreshness(sec('2026-11-11T01:50:00Z'),at('2026-11-11T03:10:00Z'),'FX').stale);
assert(quoteFreshness(sec('2026-11-10T12:00:00Z'),at('2026-11-11T03:10:00Z'),'FX').stale);
assert(!quoteFreshness(sec('2026-11-06T20:00:00Z'),at('2026-11-08T12:00:00Z'),'FX').stale);

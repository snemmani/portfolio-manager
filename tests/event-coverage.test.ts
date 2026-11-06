import assert from 'node:assert/strict';
import {eventSafety} from '../lib/event-policy';
import {eventCoverage} from '../lib/event-coverage';
const now=new Date().toISOString(),fallback={coverageVersion:2,ok:true,checkedAt:now,issues:[],fingerprint:'same',news:{ok:true,source:'Google News RSS',checkedAt:now,articlesMatched:3,attempts:[{source:'Yahoo Finance RSS',status:'unavailable',reason:'HTTPError'},{source:'Google News RSS',status:'available'}]},calendar:{ok:true,source:'Yahoo Finance company calendar',checkedAt:now,events:[]}};
const result={...fallback,...eventCoverage(fallback)};
assert(eventSafety(result).clear,'A real fallback plus an independent calendar can restore event coverage');
for(const source of ['Yahoo Finance RSS','Google News RSS','Bing News RSS'])assert(eventSafety({...fallback,...eventCoverage({...fallback,news:{...fallback.news,source,attempts:[{source,status:'available'}]}})}).clear);
const upcoming={...result,issues:['Results expected within 14 days: 2026-11-05'],fingerprint:'earnings'};
assert(eventSafety(upcoming).clear,'Upcoming results are a warning, not a pause');assert(eventSafety(upcoming).warnings.some((w:string)=>w.startsWith('Results due soon')));
const flagged={...result,issues:['Possible material news: Regulator opens investigation into the company'],fingerprint:'earnings'};
assert(!eventSafety(flagged).clear);assert(eventSafety(flagged,'earnings').clear,'Serious events remain reviewable only after both feeds work');
assert(!eventSafety({...flagged,fingerprint:'new occurrence'},'earnings').clear);
for(const part of ['news','calendar']){
 const absent={...flagged,[part]:{...(flagged as any)[part],ok:false}};
 assert(!eventSafety(absent,'earnings').clear,'A review cannot override unavailable '+part);
 const stale={...result,[part]:{...(result as any)[part],checkedAt:'2000-01-01'}};
 assert(!eventSafety(stale).clear);
 assert(!(eventCoverage(stale) as any)[part].ok);
}
assert(!eventCoverage({...fallback,news:{...fallback.news,source:'Untrusted source'}}).news.ok);
assert(!eventCoverage({...fallback,news:{...fallback.news,attempts:[]}}).news.ok);
assert(!eventCoverage({...fallback,calendar:{...fallback.calendar,events:[{kind:'earnings',at:'invalid'}]}}).calendar.ok);
assert(eventSafety({...result,news:{...result.news,articlesMatched:0,empty:true}}).clear,'An explicitly completed empty company search is distinct from an outage');
assert(!eventSafety({...result,ok:false}).clear);
console.log('PASS: independent source failover, per-component freshness, material-event acknowledgements, changed-event invalidation and no outage/calendar bypass.');

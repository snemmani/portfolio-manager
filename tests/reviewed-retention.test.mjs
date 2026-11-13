import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {saveDiscovery,storedDiscovery,retainReviewedCandidates,recheckCandidate} from '/tmp/arthapalana-reviewed-retention.mjs';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
let writes=0;
const DB={prepare(s){const make=args=>({bind(...a){return make(a)},async first(){return sql.prepare(s).get(...args)||null},async all(){return {results:sql.prepare(s).all(...args)}},async run(){return {meta:{changes:sql.prepare(s).run(...args).changes}}}});return make([])},async batch(stmts){writes+=stmts.length;sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
const env={DB};sql.exec("INSERT OR IGNORE INTO market_state(id) VALUES('local')");
for(const t of ['HERO.NS','OFSS.NS'])sql.prepare('INSERT INTO fundamental_reviews(ticker,data_json,researched_at) VALUES(?,?,?)').run(t,JSON.stringify({decision:'supported'}),'2026-11-11');
const company=(ticker,status='eligible',time='2026-11-11T01:00:00Z')=>({ticker,status,screenedAt:time,scorecard:{status},annualSeries:[{period:'2026-03-31'}]});
const cycle=(i,candidates)=>({asOf:'2026-11-11T02:00:00Z',coverage:{lastBatchAt:String(i),needsMore:i<20},candidates});
await saveDiscovery(env,cycle(0,[company('HERO.NS'),company('OFSS.NS'),company('UNREVIEWED.NS')]));
for(let i=1;i<=20;i++){
 await saveDiscovery(env,cycle(i,[company('NEW'+i+'.NS')]));
 const d=await storedDiscovery(env);
 for(const t of ['HERO.NS','OFSS.NS']){const c=d.candidates.find(c=>c.ticker===t);assert(c,'Reviewed companies survive partial/full cycles and pruning');assert(c.screenRefreshPending);assert.equal(c.status,'watchlist');assert.equal(recheckCandidate(c,true).status,'watchlist','Old annual rows cannot reauthorize buying');}
 assert(!d.candidates.some(c=>c.ticker==='UNREVIEWED.NS'));
}
// A fresh negative screen replaces a retained positive one; a late AI snapshot cannot reverse it.
await saveDiscovery(env,cycle(21,[company('HERO.NS','rejected','2026-11-11T03:00:00Z')]));
await retainReviewedCandidates(env,[company('HERO.NS','eligible','2026-11-11T01:00:00Z')]);
await saveDiscovery(env,cycle(22,[]));
assert.equal((await storedDiscovery(env)).candidates.find(c=>c.ticker==='HERO.NS').status,'rejected');
await saveDiscovery(env,cycle(23,[company('OFSS.NS','eligible','2026-11-11T04:00:00Z')]));
const ofss=(await storedDiscovery(env)).candidates.find(c=>c.ticker==='OFSS.NS');assert.equal(ofss.status,'eligible');assert(!ofss.screenRefreshPending);
// Reload the module to simulate restart; snapshots remain in SQLite, not a process cache.
const fresh=await import('/tmp/arthapalana-reviewed-retention.mjs?restart=1');assert((await fresh.storedDiscovery(env)).candidates.some(c=>c.ticker==='HERO.NS'));
console.log('PASS: reviewed candidates survive 20 screening rollovers and restart; missing screens stay visible but blocked; fresh rejections win; older review snapshots cannot overwrite new financial evidence.');

const before=writes;await retainReviewedCandidates(env,[...Array.from({length:2000},(_,i)=>company('UNREVIEWED'+i)),...Array.from({length:2000},()=>company('OFSS.NS'))]);assert.equal(writes-before,1,'Archive writes must scale with reviewed tickers, not the full screening universe or duplicates');

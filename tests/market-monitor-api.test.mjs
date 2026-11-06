import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {marketHandler} from '/tmp/arthapalana-market-handler.mjs';import {eventSafety} from '/tmp/arthapalana-event-policy.mjs';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(s){const make=args=>({bind(...a){return make(a)},async first(){return sql.prepare(s).get(...args)||null},async all(){return {results:sql.prepare(s).all(...args)}},async run(){const r=sql.prepare(s).run(...args);return {meta:{changes:r.changes}}}});return make([])},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
const env={DB,RULES_BASED_BUYS:'1',RUNNER_SHARED_SECRET:'monitor',NOCODB_TOKEN:'test',CF_ACCESS_CLIENT_ID:'test',CF_ACCESS_CLIENT_SECRET:'test'};let ai=0;const start=Math.floor(Date.now()/1000)-3600;
globalThis.fetch=async url=>{const u=String(url);if(u.includes('openai.com')){ai++;throw Error('No AI allowed');}
 if(u.includes('noco.'))return Response.json({list:[{Id:1,Ticker:'CASH',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Deposit',NoOfShares:1,CostPerShare:9500},{Id:2,Ticker:'AAA.NS',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Buy',NoOfShares:5,CostPerShare:100}],pageInfo:{isLastPage:true}});
 if(u.includes('fundamentals-timeseries')){const values={NetIncome:[200,230,260,300],TotalRevenue:[700,750,800,1000],StockholdersEquity:[450,470,490,500],TotalDebt:[100,100,100,100],OperatingCashFlow:[220,250,280,320],FreeCashFlow:[200,230,260,300],BasicEPS:[10,11.5,13,15],OrdinarySharesNumber:[20,20,20,20],EBIT:[300,340,380,420],InterestExpense:[5,5,5,5],TotalAssets:[780,800,820,850],CurrentAssets:[300,300,310,320],CurrentLiabilities:[150,150,150,150],RetainedEarnings:[200,250,300,350],TotalLiabilitiesNetMinorityInterest:[300,320,330,350]};return Response.json({timeseries:{result:Object.entries(values).map(([key,values])=>({meta:{type:['annual'+key]},['annual'+key]:values.map((raw,i)=>({asOfDate:(2023+i)+'-03-31',currencyCode:'INR',reportedValue:{raw}}))}))}});}
 const intra=u.includes('interval=5m'),times=intra?Array.from({length:12},(_,i)=>start+i*300):Array.from({length:70},(_,i)=>start-(70-i)*86400),closes=times.map(()=>100);return Response.json({chart:{result:[{meta:{symbol:'AAA.NS',currency:'INR',regularMarketPrice:100,regularMarketTime:Date.now()/1000-10,exchangeTimezoneName:'Asia/Kolkata',currentTradingPeriod:{regular:{start,end:start+23400}}},timestamp:times,indicators:{quote:[{open:closes,high:closes.map(v=>v+2),low:closes.map(v=>v-2),close:closes,volume:closes.map(()=>100)}]}}]}});
};

const internal=body=>new Request('http://localhost/api/market/tick',{method:'POST',headers:{Authorization:'Bearer monitor'},body:JSON.stringify(body)});
const user=(body,origin='http://localhost')=>new Request('http://localhost/api/market',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)});
assert.equal((await marketHandler(user({operation:'refresh'},'https://evil.example'),env)).status,403);
assert.equal((await marketHandler(new Request('http://localhost/api/market/tick',{method:'POST',body:'{}'}),env)).status,401);
let r=await marketHandler(internal({operation:'claim'}),env),job=(await r.json()).job;assert(job);assert(job.newsTickers.includes('AAA.NS'));assert(job.targets.some(t=>t.ticker==='AAA.NS'));assert.equal((await(await marketHandler(internal({operation:'claim'}),env)).json()).job,null,'Monitor lease is exclusive');
await marketHandler(internal({operation:'events',lease:job.lease,events:[{ticker:'AAA.NS',ok:true,issues:['Possible material news: Regulator opens investigation into accounts'],headlines:[{title:'Regulator opens investigation into accounts',url:'https://example.com/news',publishedAt:'2026-11-04T00:00:00Z'}]}]}),env);
let data=await(await marketHandler(new Request('http://localhost/api/market'),env)).json();const event=data.events['AAA.NS'];assert(!eventSafety(event).clear);
assert.equal((await marketHandler(user({operation:'acknowledge',ticker:'AAA.NS',fingerprint:'wrong'}),env)).status,409);
assert.equal((await marketHandler(user({operation:'acknowledge',ticker:'AAA.NS',fingerprint:event.fingerprint}),env)).status,200);
data=await(await marketHandler(new Request('http://localhost/api/market'),env)).json();assert(eventSafety(data.events['AAA.NS'],data.eventAcks['AAA.NS']).clear);
await marketHandler(internal({operation:'events',lease:job.lease,events:[{ticker:'AAA.NS',ok:true,issues:['Possible material news: Regulator opens investigation into accounts'],headlines:[{title:'Regulator opens investigation into accounts',url:'https://example.com/new-story',publishedAt:'2026-11-04T00:30:00Z'}]}]}),env);
data=await(await marketHandler(new Request('http://localhost/api/market'),env)).json();assert(!eventSafety(data.events['AAA.NS'],data.eventAcks['AAA.NS']).clear,'A new occurrence is not cleared by an old review');
const fallbackCoverage={ticker:'AAA.NS',coverageVersion:2,ok:true,issues:['Results expected within 14 days: 2026-11-05'],headlines:[],news:{ok:true,source:'Google News RSS',checkedAt:new Date().toISOString(),articlesMatched:2,attempts:[{source:'Yahoo Finance RSS',status:'unavailable'},{source:'Google News RSS',status:'available'}]},calendar:{ok:true,source:'Yahoo Finance company calendar',checkedAt:new Date().toISOString(),events:[{kind:'earnings',at:'2026-11-05T10:00:00Z'}]}};
await marketHandler(internal({operation:'events',lease:job.lease,events:[fallbackCoverage]}),env);
data=await(await marketHandler(new Request('http://localhost/api/market'),env)).json();let stored=data.events['AAA.NS'];assert.equal(stored.news.source,'Google News RSS');assert(stored.ok);assert.equal(stored.news.attempts.length,2);assert(eventSafety(stored).clear,'Upcoming results are a warning');assert(eventSafety(stored).warnings.some(w=>w.startsWith('Results due soon')),'Fallback preserves the earnings notice');
assert.equal((await marketHandler(user({operation:'acknowledge',ticker:'AAA.NS',fingerprint:stored.fingerprint}),env)).status,200);
await marketHandler(internal({operation:'events',lease:job.lease,events:[{...fallbackCoverage,calendar:{...fallbackCoverage.calendar,ok:false}}]}),env);
data=await(await marketHandler(new Request('http://localhost/api/market'),env)).json();stored=data.events['AAA.NS'];assert(!stored.ok);assert(!eventSafety(stored,data.eventAcks['AAA.NS']).clear,'No acknowledgement can override calendar failure');assert.equal((await marketHandler(user({operation:'acknowledge',ticker:'AAA.NS',fingerprint:stored.fingerprint}),env)).status,409);
r=await marketHandler(internal({operation:'finish',lease:job.lease,slot:job.slot,plans:[]}),env);assert.equal(r.status,200);assert.equal(sql.prepare('SELECT count(*) n FROM rule_reports').get().n,1);assert.equal(sql.prepare('SELECT count(*) n FROM buy_review_runs').get().n,1);assert.equal(sql.prepare('SELECT count(*) n FROM research_jobs').get().n,0,'Market checks queue no AI jobs');
// The user event review above explicitly requested a refresh; consume that request.
r=await marketHandler(internal({operation:'claim'}),env);job=(await r.json()).job;assert(job);await marketHandler(internal({operation:'finish',lease:job.lease,slot:job.slot,plans:[]}),env);
assert.equal((await(await marketHandler(internal({operation:'claim'}),env)).json()).job,null,'No repeat in a completed quarter-hour');assert.equal(ai,0);
console.log('PASS: signed monitor, same-origin user actions, exclusive lease, event review fingerprints, new-story invalidation, persisted rules cycle and no AI jobs/calls.');

// A user-started financial scan drains separately from market and AI reviews.
const broad={asOf:new Date().toISOString(),criteriaVersion:'jarvis-paginated-v2',screens:[],errors:[],candidates:[],coverage:{needsMore:true,pendingWork:100,lastBatchAt:new Date(Date.now()-61000).toISOString()}};
sql.prepare("UPDATE market_state SET discovery_json=?,last_slot=? WHERE id='local'").run(JSON.stringify(broad),String(Math.floor(Date.now()/900000)));
const priorChecked=sql.prepare('SELECT last_checked FROM market_state').get().last_checked;
const priorRuns=sql.prepare('SELECT count(*) n FROM buy_review_runs').get().n;
job=(await(await marketHandler(internal({operation:'claim'}),env)).json()).job;assert(job?.screenOnly&&job.needDiscovery);
const refreshed={...broad,coverage:{...broad.coverage,lastBatchAt:new Date().toISOString(),needsMore:false,pendingWork:0}};
r=await marketHandler(internal({operation:'discovery',lease:job.lease,discovery:refreshed}),env);assert.equal(r.status,200);
assert.equal((await marketHandler(internal({operation:'screen_finish',lease:job.lease}),env)).status,200);
assert.equal(sql.prepare('SELECT last_checked FROM market_state').get().last_checked,priorChecked);
assert.equal(sql.prepare('SELECT count(*) n FROM buy_review_runs').get().n,priorRuns,'Financial backfill does not masquerade as a full new recommendations review');
assert.equal(sql.prepare('SELECT count(*) n FROM research_jobs').get().n,0);
assert.equal((await(await marketHandler(internal({operation:'claim'}),env)).json()).job,null);
console.log('PASS: resumable financial-only batches preserve technical cadence, create no AI job or notification cycle, and stop on completion.');

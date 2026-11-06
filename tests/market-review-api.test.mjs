import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {reviewProtocol} from '/tmp/arthapalana-market-review.mjs';import {eventSafety} from '/tmp/arthapalana-event-policy.mjs';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(s){const make=args=>({bind(...a){return make(a)},async first(){return sql.prepare(s).get(...args)||null},async all(){return {results:sql.prepare(s).all(...args)}},async run(){const r=sql.prepare(s).run(...args);return {meta:{changes:r.changes}}}});return make([])},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
const env={DB,RULES_BASED_BUYS:'1',RUNNER_SHARED_SECRET:'monitor',NOCODB_TOKEN:'test',CF_ACCESS_CLIENT_ID:'test',CF_ACCESS_CLIENT_SECRET:'test'};let ai=0,nocoReads=0;const start=Math.floor(Date.now()/1000)-3600;
globalThis.fetch=async url=>{const u=String(url);if(u.includes('openai.com')){ai++;throw Error('No AI allowed');}
 if(u.includes('noco.')){nocoReads++;return Response.json({list:[{Id:1,Ticker:'CASH',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Deposit',NoOfShares:1,CostPerShare:9500},{Id:2,Ticker:'AAA.NS',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Buy',NoOfShares:5,CostPerShare:100}],pageInfo:{isLastPage:true}});}
 if(u.includes('fundamentals-timeseries')){const values={NetIncome:[200,230,260,300],TotalRevenue:[700,750,800,1000],StockholdersEquity:[450,470,490,500],TotalDebt:[100,100,100,100],OperatingCashFlow:[220,250,280,320],FreeCashFlow:[200,230,260,300],BasicEPS:[10,11.5,13,15],OrdinarySharesNumber:[20,20,20,20],EBIT:[300,340,380,420],InterestExpense:[5,5,5,5],TotalAssets:[780,800,820,850],CurrentAssets:[300,300,310,320],CurrentLiabilities:[150,150,150,150],RetainedEarnings:[200,250,300,350],TotalLiabilitiesNetMinorityInterest:[300,320,330,350]};return Response.json({timeseries:{result:Object.entries(values).map(([key,values])=>({meta:{type:['annual'+key]},['annual'+key]:values.map((raw,i)=>({asOfDate:(2023+i)+'-03-31',currencyCode:'INR',reportedValue:{raw}}))}))}});}
 const intra=u.includes('interval=5m'),times=intra?Array.from({length:12},(_,i)=>start+i*300):Array.from({length:70},(_,i)=>start-(70-i)*86400),closes=times.map(()=>100);return Response.json({chart:{result:[{meta:{symbol:'AAA.NS',currency:'INR',regularMarketPrice:100,regularMarketTime:Date.now()/1000-10,exchangeTimezoneName:'Asia/Kolkata',currentTradingPeriod:{regular:{start,end:start+23400}}},timestamp:times,indicators:{quote:[{open:closes,high:closes.map(v=>v+2),low:closes.map(v=>v-2),close:closes,volume:closes.map(()=>100)}]}}]}});
};


const response=async(operation,body={})=>reviewProtocol({operation,...body},env);
await DB.prepare("INSERT OR IGNORE INTO market_state(id,requested) VALUES('local',1)").run();
let job=(await(await response('claim',{claimId:'stable-claim-identifier-0001'})).json()).job;
assert(job?.reviewId);assert.equal(nocoReads,0,'Claim is cheap and does not collect portfolio data');
let duplicate=(await(await response('claim',{claimId:'stable-claim-identifier-0001'})).json()).job;
assert.equal(duplicate.lease,job.lease,'Lost claim responses can be retried without orphaning the lease');
assert.equal((await(await response('claim',{claimId:'different-claim-identifier-0002'})).json()).job,null);
const identity=()=>({lease:job.lease,reviewId:job.reviewId});
let p=await response('prepare',identity());assert.equal(p.status,200);const prepared=await p.json();assert(prepared.newsTickers.includes('AAA.NS'));assert.equal(nocoReads,1);
await response('prepare',identity());assert.equal(nocoReads,1,'Prepare response retry reuses the persisted snapshot');
const restarted=await import('/tmp/arthapalana-market-review.mjs?restarted=1');await restarted.reviewProtocol({operation:'prepare',...identity()},env);assert.equal(nocoReads,1,'A restarted web runtime reuses the same persisted snapshot');
const events=[{ticker:'AAA.NS',ok:true,issues:[],headlines:[],coverageVersion:2,news:{ok:true,source:'Google News RSS',checkedAt:new Date().toISOString(),articlesMatched:1,attempts:[{source:'Google News RSS',status:'available'}]},calendar:{ok:true,source:'Yahoo Finance company calendar',checkedAt:new Date().toISOString(),events:[]}}];
assert.equal((await response('events',{...identity(),events})).status,200);assert.equal((await response('events',{...identity(),events})).status,200);
assert.equal((await response('events',{...identity(),events:[{...events[0],ok:false}]})).status,409,'Retry cannot replace evidence with a different payload');
const context=await response('context',identity());assert.equal(context.status,200);const {frame}=await context.json();assert.equal(nocoReads,1,'Context uses the captured portfolio, rather than reading it again');assert.equal(frame.targets.length,1);assert(frame.snap.ledgerRevision);
assert.equal((await response('context',identity())).status,200);assert.equal(nocoReads,1);
// Simulate a monitor crash and lease release. The next owner resumes the exact frame.
await response('fail',{...identity(),error:'simulated transient disconnect'});
job=(await(await response('claim',{claimId:'resumed-claim-identifier-0003'})).json()).job;assert.equal(job.reviewId,frame.reviewId);
const resumed=(await(await response('context',identity())).json()).frame;assert.deepEqual(resumed,frame);assert.equal(nocoReads,1);
const plans=frame.targets.map(t=>({...t,plan:{authorized:false,canDraft:false,quantity:null},technical:{currency:'INR',quoteTime:Date.now()/1000},checkedAt:new Date().toISOString()}));
assert.equal((await response('finish',{...identity(),plans:[]})).status,400);
let finished=await response('finish',{...identity(),plans});assert.equal(finished.status,200);assert.equal(nocoReads,2,'Only the final ledger revision is rechecked; no second portfolio snapshot is calculated');
assert.equal(sql.prepare('SELECT count(*) n FROM buy_review_runs').get().n,1);
finished=await response('finish',{...identity(),plans});assert.equal(finished.status,200);assert((await finished.json()).alreadyCompleted);assert.equal(nocoReads,2);assert.equal(sql.prepare('SELECT count(*) n FROM buy_review_runs').get().n,1,'Lost completion responses cannot duplicate review notifications');
assert.equal((await response('heartbeat',identity())).status,409,'A completed lease cannot be reused');
assert.equal(ai,0);
// A new transaction invalidates the entire frame rather than publishing stale sizing.
await DB.prepare("UPDATE market_state SET requested=1 WHERE id='local'").run();job=(await(await response('claim',{claimId:'changed-ledger-identifier-0004'})).json()).job;await response('prepare',identity());await response('events',{...identity(),events});await response('context',identity());
const previousFetch=globalThis.fetch;globalThis.fetch=async url=>{const r=await previousFetch(url);if(String(url).includes('noco.')){const d=await r.json();d.list[0].CostPerShare+=1;return Response.json(d)}return r};
const changed=await response('finish',{...identity(),plans});assert.equal(changed.status,409);assert.equal((await changed.json()).code,'SNAPSHOT_CHANGED');assert.equal(sql.prepare('SELECT count(*) n FROM buy_review_runs').get().n,1);
globalThis.fetch=previousFetch;
// A running stage returns pending; callers wait rather than start another data collection.
await DB.prepare("UPDATE market_state SET requested=1 WHERE id='local'").run();job=(await(await response('claim',{claimId:'changed-policy-identifier-0005'})).json()).job;
await DB.prepare('UPDATE market_reviews SET busy_token=?,busy_until=? WHERE id=?').bind('other-worker',new Date(Date.now()+60000).toISOString(),job.reviewId).run();
const beforeBusy=nocoReads;assert.equal((await response('prepare',identity())).status,202);assert.equal(nocoReads,beforeBusy);
await DB.prepare('UPDATE market_reviews SET busy_token=NULL,busy_until=NULL WHERE id=?').bind(job.reviewId).run();
await response('prepare',identity());await response('events',{...identity(),events});await response('context',identity());
await DB.prepare('INSERT INTO event_acknowledgements(ticker,fingerprint,created_at) VALUES(?,?,?)').bind('AAA.NS','changed-approval',new Date().toISOString()).run();
const policyChanged=await response('finish',{...identity(),plans});assert.equal(policyChanged.status,409);assert.equal((await policyChanged.json()).code,'SNAPSHOT_CHANGED');assert.equal(sql.prepare('SELECT count(*) n FROM buy_review_runs').get().n,1,'Changed approvals cannot publish stale plans');
job=(await(await response('claim',{claimId:'expired-review-identifier-0006'})).json()).job;
await DB.prepare('UPDATE market_reviews SET expires_at=? WHERE id=?').bind(new Date(Date.now()-1000).toISOString(),job.reviewId).run();
assert.equal((await response('prepare',identity())).status,409,'Expired snapshots must be replaced, never published');
// Bounded worklists still prioritize old/unknown coverage rather than restarting alphabetically.
const many=Array.from({length:201},(_,i)=>({ticker:'NEW'+String(i).padStart(3,'0'),status:'eligible',name:'Company '+i}));
await DB.prepare("UPDATE market_state SET discovery_json=?,events_json=? WHERE id='local'").bind(JSON.stringify({candidates:many,asOf:new Date().toISOString(),criteriaVersion:'jarvis-paginated-v2'}),JSON.stringify(Object.fromEntries(many.slice(0,200).map(c=>[c.ticker,{checkedAt:new Date().toISOString()}])))).run();
job=(await(await response('claim',{claimId:'fair-news-worklist-identifier-0007'})).json()).job;
const fair=await(await response('prepare',identity())).json();assert.equal(fair.newsTickers.length,200);assert(fair.newsTickers.includes('NEW200'),'Unknown coverage must be included before recently checked candidates');assert(!fair.newsTickers.includes('NEW199'),'Capacity deferral follows existing coverage age');
console.log('PASS: one snapshot, stable claim retry, persisted context after restart, evidence idempotency, resumed review, exact plan coverage, atomic finish, notification dedupe, fresh ledger revision and no AI calls.');

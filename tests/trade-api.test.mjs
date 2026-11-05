import {storedFundamental} from './fundamental-fixture.mjs';
import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {executionHandler,tradeHandler,invalidateDashboard,dashboard} from '/tmp/arthapalana-trades.mjs';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(s){const make=args=>({bind(...a){return make(a)},async first(){return sql.prepare(s).get(...args)||null},async all(){return {results:sql.prepare(s).all(...args)}},async run(){const r=sql.prepare(s).run(...args);return {meta:{changes:r.changes}}}});return make([])}};
const env={DB,RULES_BASED_BUYS:'1',NOCODB_TOKEN:'test',CF_ACCESS_CLIENT_ID:'test',CF_ACCESS_CLIENT_SECRET:'test'};let ai=0;let sales=[],laterBuys=[];let cost=80;const start=Math.floor(Date.now()/1000)-3600;
globalThis.fetch=async url=>{const u=String(url);if(u.includes('openai.com')){ai++;throw Error('No AI allowed');}
 if(u.includes('noco.'))return Response.json({list:[{Id:1,Ticker:'CASH',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Deposit',NoOfShares:1,CostPerShare:20000},{Id:2,Ticker:'AAA.NS',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Buy',NoOfShares:10,CostPerShare:cost},...sales,...laterBuys],pageInfo:{isLastPage:true}});
 if(u.includes('fundamentals-timeseries')){const values={NetIncome:[80,100],TotalRevenue:[800,1000],StockholdersEquity:[500,500],TotalDebt:[100,100],OperatingCashFlow:[100,100],FreeCashFlow:[100,100],BasicEPS:[4,5],OrdinarySharesNumber:[20,20]};return Response.json({timeseries:{result:Object.entries(values).map(([key,values])=>({meta:{type:['annual'+key]},['annual'+key]:values.map((raw,i)=>({asOfDate:i?'2026-03-31':'2025-03-31',currencyCode:'INR',reportedValue:{raw}}))}))}});}
 const intra=u.includes('interval=5m'),times=intra?Array.from({length:12},(_,i)=>start+i*300):Array.from({length:70},(_,i)=>start-(70-i)*86400),closes=times.map((_,i)=>intra?150:130+i*20/(times.length-1));return Response.json({chart:{result:[{meta:{symbol:'AAA.NS',currency:'INR',regularMarketPrice:150,regularMarketTime:Date.now()/1000-10,exchangeTimezoneName:'Asia/Kolkata',currentTradingPeriod:{regular:{start,end:start+23400}}},timestamp:times,indicators:{quote:[{open:closes,high:closes.map(v=>v+2),low:closes.map(v=>v-2),close:closes,volume:closes.map(()=>100)}]}}]}});
};

const request=()=>new Request('http://localhost/api/execution?ticker=AAA.NS&portfolio=Test');
const post=(b,origin='http://localhost')=>tradeHandler(new Request('http://localhost/api/trades',{method:'POST',headers:{Origin:origin},body:JSON.stringify(b)}),env);
const data=()=>executionHandler(request(),env).then(r=>r.json());
let d=await data();assert.equal(d.plan.side,'sell');assert.equal(d.plan.authorized,false);assert.equal(d.saleAssessment.impact.grossPnl,140);assert.equal(d.saleAssessment.reviewable,false,'No event coverage means no profit approval');
assert.equal((await post({operation:'settings'},'https://evil.example')).status,403);assert.equal((await post({operation:'settings',policy:{gainThresholdPct:Infinity}})).status,400);
sql.prepare("UPDATE market_state SET events_json=? WHERE id='local'").run(JSON.stringify({'AAA.NS':{ok:true,checkedAt:new Date().toISOString(),issues:[],fingerprint:'clear'}}));
d=await data();assert(!d.saleAssessment.reviewable,'Profit-taking requires a reviewed business outlook');const company=storedFundamental();sql.prepare('INSERT INTO fundamental_reviews(ticker,data_json,researched_at) VALUES(?,?,?)').run(company.ticker,JSON.stringify(company),company.researchedAt);
d=await data();assert(d.saleAssessment.reviewable);assert(!d.plan.authorized);const profitToken=d.saleAssessment.reviewToken;
assert.equal((await post({operation:'review_profit',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:'wrong'})).status,409);
assert.equal((await post({operation:'review_profit',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:profitToken})).status,200);
d=await data();assert.equal(d.plan.authorized,true);assert.equal(d.plan.canDraft,true);assert.equal(d.plan.quantity,2);
let policy=(await(await tradeHandler(new Request('http://localhost/api/trades'),env)).json()).policy;
assert.equal((await post({operation:'settings',policy:{...policy,trimPct:30}})).status,200);d=await data();assert(!d.plan.authorized,'Changing settings invalidates the old approval');
await post({operation:'settings',policy});
const sale=(qty,date)=>({Id:3,Ticker:'AAA.NS',Portfolio:'Test',Date:date,TransactionType:'Sell',NoOfShares:qty,CostPerShare:180});
sales=[sale(2,new Date(Date.now()-86400000).toISOString().slice(0,10))];invalidateDashboard();let snap=await dashboard(env);assert.equal(snap.reentries[0].status,'cooldown');d=await data();assert(!d.plan.authorized);assert.notEqual(snap.holdings[0].action,'Profit review','A confirmed sale suspends another profit review while its re-entry watch is active');
sales=[sale(2,'2026-09-01')];invalidateDashboard();snap=await dashboard(env);let watch=snap.reentries[0];assert.equal(watch.status,'watch');assert.equal((await post({operation:'review_reentry',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:watch.historyKey})).status,200);
d=await data();assert.equal(d.plan.side,'buy');assert(d.plan.authorized);assert.equal(d.plan.quantity,2,'Re-entry cannot exceed the number of shares sold');
// A later recorded purchase closes this watch instead of starting repeated alerts.
laterBuys=[{Id:4,Ticker:'AAA.NS',Portfolio:'Test',Date:'2026-10-01',TransactionType:'Buy',NoOfShares:1,CostPerShare:140}];invalidateDashboard();snap=await dashboard(env);assert.equal(snap.reentries[0].status,'completed');
// A fully exited holding remains tracked and can qualify from fresh empirical evidence.
laterBuys=[];sales=[sale(10,'2026-09-01')];invalidateDashboard();snap=await dashboard(env);assert.equal(snap.holdings.length,0);watch=snap.reentries[0];assert(watch.financialPass);await post({operation:'review_reentry',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:watch.historyKey});d=await data();assert.equal(d.plan.side,'buy');assert(d.plan.authorized);assert(d.plan.quantity>0);
assert.equal(ai,0);console.log('PASS: current FIFO sale estimate, event safeguard, same-origin settings, exact assessment review, approval invalidation, recorded-sale cooldown, partial re-entry share cap, later-buy closure, fully exited re-entry and no AI calls.');

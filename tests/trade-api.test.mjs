import {withFinancialAssumptions,storedFundamental} from './fundamental-fixture.mjs';
import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {executionHandler,tradeHandler,invalidateDashboard,dashboard} from '/tmp/arthapalana-trades.mjs';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(s){const make=args=>({bind(...a){return make(a)},async first(){return sql.prepare(s).get(...args)||null},async all(){return {results:sql.prepare(s).all(...args)}},async run(){const r=sql.prepare(s).run(...args);return {meta:{changes:r.changes}}}});return make([])}};
const env={DB,RULES_BASED_BUYS:'1',NOCODB_TOKEN:'test',CF_ACCESS_CLIENT_ID:'test',CF_ACCESS_CLIENT_SECRET:'test'};let ai=0;let sales=[],laterBuys=[];let cost=80;const start=Math.floor(Date.now()/1000)-3600;
globalThis.fetch=async url=>{const u=String(url);if(u.includes('openai.com')){ai++;throw Error('No AI allowed');}
 if(u.includes('noco.'))return Response.json({list:[{Id:1,Ticker:'CASH',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Deposit',NoOfShares:1,CostPerShare:20000},{Id:2,Ticker:'AAA.NS',Portfolio:'Test',Date:'2025-01-01',TransactionType:'Buy',NoOfShares:10,CostPerShare:cost},...sales,...laterBuys],pageInfo:{isLastPage:true}});
 if(u.includes('fundamentals-timeseries')){const values={NetIncome:[200,230,260,300],TotalRevenue:[700,750,800,1000],StockholdersEquity:[450,470,490,500],TotalDebt:[100,100,100,100],OperatingCashFlow:[220,250,280,320],FreeCashFlow:[200,230,260,300],BasicEPS:[10,11.5,13,15],OrdinarySharesNumber:[20,20,20,20],EBIT:[300,340,380,420],InterestExpense:[5,5,5,5],TotalAssets:[780,800,820,850],CurrentAssets:[300,300,310,320],CurrentLiabilities:[150,150,150,150],RetainedEarnings:[200,250,300,350],TotalLiabilitiesNetMinorityInterest:[300,320,330,350]};return Response.json({timeseries:{result:Object.entries(values).map(([key,values])=>({meta:{type:['annual'+key]},['annual'+key]:values.map((raw,i)=>({asOfDate:(2023+i)+'-03-31',currencyCode:'INR',reportedValue:{raw}}))}))}});}
 const intra=u.includes('interval=5m'),times=intra?Array.from({length:12},(_,i)=>start+i*300):Array.from({length:70},(_,i)=>start-(70-i)*86400),closes=times.map((_,i)=>intra?150:130+i*20/(times.length-1));return Response.json({chart:{result:[{meta:{symbol:'AAA.NS',currency:'INR',regularMarketPrice:150,regularMarketTime:Date.now()/1000-10,exchangeTimezoneName:'Asia/Kolkata',currentTradingPeriod:{regular:{start,end:start+23400}}},timestamp:times,indicators:{quote:[{open:closes,high:closes.map(v=>v+2),low:closes.map(v=>v-2),close:closes,volume:closes.map(()=>100)}]}}]}});
};

const request=()=>new Request('http://localhost/api/execution?ticker=AAA.NS&portfolio=Test');
const post=(b,origin='http://localhost')=>tradeHandler(new Request('http://localhost/api/trades',{method:'POST',headers:{Origin:origin},body:JSON.stringify(b)}),env);
const data=()=>executionHandler(request(),env).then(r=>r.json());
let d=await data();assert.equal(d.plan.side,'sell');assert.equal(d.plan.authorized,false);assert.equal(d.saleAssessment.impact.grossPnl,70,'One over-extension signal stages a 10% trim');assert.equal(d.saleAssessment.reviewable,false,'No event coverage means no profit approval');
assert(d.saleAssessment.checks.some(s=>s.includes('Profit-taking approval waits for a fresh check')));assert(d.saleAssessment.checks.some(s=>s.includes('company investment review is required')));assert(!d.saleAssessment.checks.some(s=>s.includes('Buying waits')||s.includes('propose buying')),'Sale blockers must describe profit-taking approval');
assert.equal((await post({operation:'settings'},'https://evil.example')).status,403);assert.equal((await post({operation:'settings',policy:{gainThresholdPct:Infinity}})).status,400);
sql.prepare("UPDATE market_state SET events_json=? WHERE id='local'").run(JSON.stringify({'AAA.NS':{ok:true,checkedAt:new Date().toISOString(),issues:[],fingerprint:'clear'}}));
d=await data();assert(!d.saleAssessment.reviewable,'Profit-taking requires a reviewed business outlook');const company=storedFundamental('AAA.NS','INR',1e9,(await dashboard(env)).holdings[0].scorecard.intrinsic);sql.prepare('INSERT INTO fundamental_reviews(ticker,data_json,researched_at) VALUES(?,?,?)').run(company.ticker,JSON.stringify(company),company.researchedAt);
d=await data();assert(d.saleAssessment.reviewable);assert(!d.plan.authorized);const profitToken=d.saleAssessment.reviewToken;
assert.equal((await post({operation:'review_profit',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:'wrong'})).status,409);
assert.equal((await post({operation:'review_profit',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:profitToken})).status,200);
d=await data();assert.equal(d.plan.authorized,true);assert.equal(d.plan.canDraft,true);assert.equal(d.plan.quantity,1,'Staged 10% profit trim of the holding');
let policy=(await(await tradeHandler(new Request('http://localhost/api/trades'),env)).json()).policy;
assert.equal((await post({operation:'settings',policy:{...policy,trimPct:30}})).status,200);d=await data();assert(!d.plan.authorized,'Changing settings invalidates the old approval');
await post({operation:'settings',policy});
const sale=(qty,date)=>({Id:3,Ticker:'AAA.NS',Portfolio:'Test',Date:date,TransactionType:'Sell',NoOfShares:qty,CostPerShare:180});
sales=[sale(2,new Date(Date.now()-86400000).toISOString().slice(0,10))];invalidateDashboard();let snap=await dashboard(env);assert.equal(snap.reentries[0].status,'cooldown');d=await data();assert(!d.plan.authorized);
assert(snap.holdings[0].profitReview.triggered,'A recorded sale must not hide the threshold review');
assert(snap.holdings[0].profitReview.blockers.some(s=>s.includes('waiting period')));
let profit=await(await executionHandler(new Request('http://localhost/api/execution?ticker=AAA.NS&portfolio=Test&intent=profit'),env)).json();
assert.equal(profit.plan.side,'sell');assert(!profit.plan.authorized&&!profit.plan.canDraft&&!profit.saleAssessment.reviewable);
assert(profit.saleAssessment.checks.some(s=>s.includes('re-entry watch')));
assert.equal((await post({operation:'review_profit',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:profit.saleAssessment.reviewToken})).status,409,'Direct approval cannot bypass the cooldown or re-entry watch');
sales=[sale(2,'2026-09-01')];invalidateDashboard();snap=await dashboard(env);let watch=snap.reentries[0];assert.equal(watch.status,'watch');assert(snap.holdings[0].profitReview.triggered);
profit=await(await executionHandler(new Request('http://localhost/api/execution?ticker=AAA.NS&portfolio=Test&intent=profit'),env)).json();assert(!profit.saleAssessment.reviewable&&!profit.plan.authorized);assert(profit.saleAssessment.checks.some(s=>s.includes('re-entry watch')),'Expired cooldown does not clear the existing active-watch sale restriction');
assert.equal((await post({operation:'review_reentry',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:watch.historyKey})).status,200);
d=await data();assert.equal(d.plan.side,'buy');assert(d.plan.authorized);assert.equal(d.plan.quantity,2,'Re-entry cannot exceed the number of shares sold');
// A later recorded purchase closes this watch instead of starting repeated alerts.
laterBuys=[{Id:4,Ticker:'AAA.NS',Portfolio:'Test',Date:'2026-10-01',TransactionType:'Buy',NoOfShares:1,CostPerShare:140}];invalidateDashboard();snap=await dashboard(env);assert.equal(snap.reentries[0].status,'completed');
// A fully exited holding remains tracked and can qualify from fresh empirical evidence.
laterBuys=[];sales=[sale(10,'2026-09-01')];invalidateDashboard();snap=await dashboard(env);assert.equal(snap.holdings.length,0);watch=snap.reentries[0];assert(watch.financialPass);await post({operation:'review_reentry',ticker:'AAA.NS',portfolio:'Test',confirmed:true,fingerprint:watch.historyKey});d=await data();assert.equal(d.plan.side,'buy');assert(d.plan.authorized);assert(d.plan.quantity>0);
// A reviewed re-entry and valid technical plan cannot bypass the five-year return hurdle.
const lowReturn=structuredClone(company);lowReturn.valuation.returnProjection.year3Value=250;lowReturn.valuation.returnProjection.year5Value=200;lowReturn.valuation.returnProjection.year5BearValue=150;lowReturn.valuation.returnProjection.epsNow=200/60;lowReturn.valuation.returnProjection.year5Eps=200/60;withFinancialAssumptions(lowReturn);
sql.prepare('UPDATE fundamental_reviews SET data_json=? WHERE ticker=?').run(JSON.stringify(lowReturn),company.ticker);
d=await data();assert.equal(d.plan.side,'buy');assert.equal(d.plan.authorized,false);assert.equal(d.plan.canDraft,false);assert.match(d.plan.decisionReason,/15%/);assert(d.returnPotential.scenarios[0].cagr>.15&&d.returnPotential.scenarios[1].cagr<.15);
sql.prepare('UPDATE fundamental_reviews SET data_json=? WHERE ticker=?').run(JSON.stringify(company),company.ticker);d=await data();assert(d.plan.authorized,'Restoring a qualifying forecast restores the valid re-entry plan without weakening its other checks');
assert.equal(ai,0);console.log('PASS: current FIFO sale estimate, event safeguard, same-origin settings, exact assessment review, approval invalidation, recorded-sale cooldown, partial re-entry share cap, later-buy closure, fully exited re-entry, mandatory five-year return enforcement after owner re-entry approval and no AI calls.');

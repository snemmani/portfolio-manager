import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {executionHandler} from '/tmp/arthapalana-execution.mjs';
const sql=new DatabaseSync(':memory:');for(const f of ['0000_graceful_blindfold','0001_amusing_white_queen','0002_wise_doctor_doom'])sql.exec(readFileSync('drizzle/'+f+'.sql','utf8'));
const env={DB:{prepare(query){return {first:async()=>sql.prepare(query).get()||null}}},NOCODB_TOKEN:'test',CF_ACCESS_CLIENT_ID:'test',CF_ACCESS_CLIENT_SECRET:'test'};
const start=Math.floor(Date.now()/1000)-3600;let paidCalls=0;
globalThis.fetch=async(url)=>{
 if(String(url).includes('api.openai.com')){paidCalls++;throw Error('API forbidden');}
 if(String(url).includes('noco.'))return Response.json({list:[{Id:1,Ticker:'AAA.NS',Portfolio:'India',Date:'2025-01-01',TransactionType:'Buy',NoOfShares:10,CostPerShare:100},{Id:2,Ticker:'ORCL',Portfolio:'ESPP',Date:'2025-01-01',TransactionType:'Buy',NoOfShares:2,CostPerShare:100}],pageInfo:{isLastPage:true}});
 if(String(url).includes('fundamentals-timeseries'))return Response.json({timeseries:{result:[]}});
 const intraday=String(url).includes('interval=5m'),times=intraday?Array.from({length:12},(_,i)=>start+i*300):Array.from({length:70},(_,i)=>start-(70-i)*86400);
 const closes=times.map(()=>100);return Response.json({chart:{result:[{meta:{symbol:String(url).includes('ORCL')?'ORCL':'AAA.NS',currency:String(url).includes('ORCL')?'USD':'INR',regularMarketPrice:100,regularMarketTime:Date.now()/1000-10,exchangeTimezoneName:'Asia/Kolkata',currentTradingPeriod:{regular:{start,end:start+23400}}},timestamp:times,indicators:{quote:[{open:closes,high:closes.map(x=>x+2),low:closes.map(x=>x-2),close:closes,volume:closes.map(()=>100)}]}}]}});
};
const req=q=>new Request('https://test.site/api/execution?'+q);
let r=await executionHandler(req('ticker=MADEUP&portfolio=India'),env);assert.equal(r.status,404);
r=await executionHandler(req('ticker=AAA.NS&portfolio=India'),env);let d=await r.json();assert.equal(r.status,200);assert.equal(d.plan.side,'sell');assert.equal(d.plan.quantity,9);assert.equal(d.plan.canDraft,true);assert.equal(d.plan.limit,100);
r=await executionHandler(req('ticker=AAA.NS&portfolio=India&intent=exit'),env);d=await r.json();assert.equal(d.plan.manualExit,true);assert.equal(d.plan.quantity,10);assert.equal(d.plan.canDraft,true);
// A portfolio holding only a locked plan is hidden, so no plan can be drafted for it at all.
r=await executionHandler(req('ticker=ORCL&portfolio=ESPP&intent=exit'),env);assert.equal(r.status,404);
r=await executionHandler(req('ticker=AAA.NS&portfolio=Wrong&intent=exit'),env);assert.equal(r.status,404);
assert.equal(paidCalls,0);console.log('PASS: whitelisted tickers, current-price trim sizing, full-exit user scenario, ORCL lock, portfolio separation and zero paid API calls.');

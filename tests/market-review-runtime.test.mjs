import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare,Log,LogLevel} from 'miniflare';
import {Checkpoint,ControlClient} from '../runner/market-support.mjs';
import {runMarketCycle} from '../runner/market-cycle.mjs';
import {technicalForStock} from '../runner/review-work.mjs';
import * as engine from '../.runner-private/market-engine.mjs';
const dir=await mkdtemp(join(tmpdir(),'arthapalana-runtime-stress-'));
let mf,nocoReads=0,priceReads=0,stockReads=0,restarts=0,discardFinish=true,networkFaults=0;
const secret='isolated-monitor-secret',logs=[];
const rows=Array.from({length:5},(_,i)=>({Id:i+1,Ticker:'CASH',Portfolio:'P'+i,Date:'2025-01-01',TransactionType:'Deposit',NoOfShares:1,CostPerShare:100000}));
function provider(input){const u=new URL(typeof input==='string'?input:input.url);if(u.hostname.includes('noco.')){nocoReads++;return Response.json({list:rows,pageInfo:{isLastPage:true}});}
 priceReads++;const ticker=decodeURIComponent(u.pathname.split('/').at(-1)),fx=ticker==='USDINR=X',now=Date.now()/1000,intra=u.searchParams.get('interval')==='5m';
 const times=intra?Array.from({length:12},(_,i)=>now-3900+i*300):Array.from({length:70},(_,i)=>now-(71-i)*86400);
 const closes=times.map(()=>fx?80:100);return Response.json({chart:{result:[{meta:{symbol:ticker,currency:fx||ticker.endsWith('.NS')||ticker.startsWith('^')?'INR':'USD',regularMarketPrice:fx?80:100,regularMarketTime:now-5,exchangeTimezoneName:'UTC',currentTradingPeriod:{regular:{start:now-7200,end:now+7200}}},timestamp:times,indicators:{quote:[{open:closes,close:closes,high:closes.map(v=>v+2),low:closes.map(v=>v-2),volume:closes.map(()=>10000)}]}}]}});
}
async function start(){mf=new Miniflare({modules:true,script:readFileSync('/tmp/arthapalana-market-review-worker.mjs','utf8'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'test-db'},d1Persist:join(dir,'db'),bindings:{RUNNER_SHARED_SECRET:secret,RULES_BASED_BUYS:'1',NOCODB_TOKEN:'test',CF_ACCESS_CLIENT_ID:'test',CF_ACCESS_CLIENT_SECRET:'test'},outboundService:provider,log:new Log(LogLevel.NONE)});await mf.ready;}
async function reboot(){await mf.dispose();await start();restarts++;}
async function db(){return mf.getD1Database('DB')}
try{
 await start();const database=await db();for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())for(const statement of readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await database.prepare(statement).run();
 const candidates=Array.from({length:50},(_,i)=>({ticker:'NEW'+i.toString().padStart(3,'0'),name:'Company '+i,market:'US',currency:'USD',category:'A',sector:'Technology',status:'eligible',price:100,quoteTime:Date.now()/1000,screenedAt:new Date().toISOString(),matchedScreens:[{bucket:'Tech',criteria:'Rev Growth>8% · ROCE>12% · LT D/E<1'}],gateReasons:[],metrics:{revenue_growth_yoy:20,earnings_growth_yoy:20,roe:25,roce:20,longTermDebtEquity:.2,cash_conversion_ratio:1,eps_ttm:1,eps_forward:2}}));
 await database.prepare("INSERT OR REPLACE INTO market_state(id,requested,discovery_json) VALUES('local',1,?)").bind(JSON.stringify({asOf:new Date().toISOString(),criteriaVersion:'jarvis-paginated-v2',screens:[],errors:[],candidates,coverage:{needsMore:false}})).run();
 const checkpoint=new Checkpoint(join(dir,'checkpoint.json'));
 const client=new ControlClient({secret,sleep:async ms=>new Promise(r=>setTimeout(r,Math.min(ms,10))),log:e=>logs.push(e),fetcher:async(url,init)=>{
  if(networkFaults>0){networkFaults--;throw Error('Injected ECONNRESET during restart');}
  const b=JSON.parse(init.body),r=await mf.dispatchFetch(url,init);if(b.operation==='finish'&&r.ok&&discardFinish){discardFinish=false;await r.text();throw Error('Injected lost completion response');}return r;
 }});
 let totalPlans=0,maxHealthMs=0;const started=Date.now(),heapBefore=process.memoryUsage().heapUsed;
 for(let cycle=0;cycle<5;cycle++){
  await(await db()).prepare("UPDATE market_state SET requested=1 WHERE id='local'").run();let stockLoads=0,rebooted=false,rebooting=false;
  const result=await runMarketCycle({client,checkpoint,engine,log:e=>logs.push(e),python:async(script,input)=>{assert.equal(script,'events.py');return {events:input.tickers.map(ticker=>({ticker,ok:true,issues:[],headlines:[],coverageVersion:2,news:{ok:true,source:'Google News RSS',checkedAt:new Date().toISOString(),articlesMatched:1,attempts:[{source:'Google News RSS',status:'available'}]},calendar:{ok:true,source:'Yahoo Finance company calendar',checkedAt:new Date().toISOString(),events:[]}}))}},loadTechnical:async ticker=>{
   stockLoads++;stockReads++;
   if(cycle===1&&!rebooted&&stockLoads===5){rebooted=true;rebooting=true;await reboot();networkFaults=2;rebooting=false;}
   if(!rebooting){const t=Date.now();try{const h=await mf.dispatchFetch('http://monitor.test/health');assert.equal(h.status,200);await h.text();maxHealthMs=Math.max(maxHealthMs,Date.now()-t);}catch(e){if(!rebooting)throw e;}}
   if(cycle===2&&ticker==='NEW007')throw Error('Injected stock feed outage');
   if(cycle===3)await new Promise(r=>setTimeout(r,15));
   return technicalForStock(ticker,{snapshot:engine.technicalSnapshot,fetcher:async url=>provider(url),sleep:async()=>{}});
  }});
  assert.equal(result.plans.length,230);assert.equal(stockLoads,result.stocks,'Each stock is collected once despite five portfolios');assert.equal(stockLoads,46);assert.equal(result.unavailable,cycle===2?5:0);totalPlans+=result.plans.length;
 }
 assert.equal(nocoReads,10,'Exactly one portfolio read plus one final revision check per review, including restart/retry');assert.equal(stockReads,230);
 assert.equal((await(await db()).prepare('SELECT count(*) n FROM buy_review_runs').first()).n,5,'Lost finish responses cannot duplicate notification cycles');
 assert(logs.some(e=>e.event==='operation_error'));assert(logs.some(e=>e.event==='stock_unavailable'));assert.equal(restarts,1);assert(maxHealthMs<5000,'Health stays responsive while price plans are computed');
 const heapGrowth=process.memoryUsage().heapUsed-heapBefore;assert(heapGrowth<160*1024*1024,'Collector memory must remain bounded across repeated reviews');
 console.log(JSON.stringify({result:'PASS',reviews:5,plans:totalPlans,uniqueStockCalculations:stockReads,portfolioReads:nocoReads,webRestarts:restarts,duplicateNotifications:0,maxHealthMs,elapsedMs:Date.now()-started,heapGrowthBytes:heapGrowth,priceRequests:priceReads}));
}finally{await mf?.dispose();await rm(dir,{recursive:true,force:true})}

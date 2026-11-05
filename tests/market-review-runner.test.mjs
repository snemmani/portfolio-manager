import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ControlClient,Checkpoint,MonitorError,startHeartbeat,safeError} from '../runner/market-support.mjs';
import {computeReview,technicalForStock} from '../runner/review-work.mjs';
import {runMarketCycle} from '../runner/market-cycle.mjs';
let time=0,requests=[],logs=[];
const client=new ControlClient({secret:'private-test-secret',now:()=>time,sleep:async ms=>{time+=ms},log:e=>logs.push(e),fetcher:async(url,request)=>{requests.push(request);if(requests.length===1)throw Error('connection reset');if(requests.length===2)return Response.json({error:'Restarting',code:'RESTARTING'},{status:503});return Response.json({ok:true});}});
assert((await client.call('finish',{reviewId:'r',plans:[{ticker:'AAA'}]})).ok);assert.equal(requests.length,3);assert.equal(new Set(requests.map(r=>r.body)).size,1,'Ambiguous upload retries preserve the exact same request');assert(logs.some(e=>e.code==='NETWORK_ERROR'));assert(logs.some(e=>e.httpStatus===503));
let denied=0;const bad=new ControlClient({secret:'s',sleep:async()=>{},fetcher:async()=>{denied++;return Response.json({error:'Unauthorized'},{status:401})}});await assert.rejects(()=>bad.call('claim'),e=>e.status===401);assert.equal(denied,1,'Authorization failures are never hammered');
let leased=0;const lost=new ControlClient({secret:'s',fetcher:async()=>{leased++;return Response.json({error:'Lease replaced',code:'LEASE_LOST'},{status:409})}});await assert.rejects(()=>lost.call('finish'),e=>e.code==='LEASE_LOST');assert.equal(leased,1);
assert(!safeError(Error('Bearer top-secret and sk-private-key https://example.com/?token=private-test-secret'),['private-test-secret']).includes('top-secret'));
let heartbeatError;const hb=startHeartbeat({call:async()=>{throw new MonitorError('Lease lost',{code:'LEASE_LOST'})}}, {},{intervalMs:100000,log:e=>heartbeatError=e});hb.tick();await new Promise(r=>setTimeout(r,10));assert.throws(()=>hb.assert(),e=>e.code==='LEASE_LOST');assert(heartbeatError);await hb.stop();
const targets=Array.from({length:230},(_,i)=>({ticker:'STOCK'+i%50,portfolio:'P'+Math.floor(i/50)}));
const frame={targets,expiresAt:new Date(Date.now()+600000).toISOString()};let fetches=0,calculations=0,active=0,maxActive=0;
const technicals={};const result=await computeReview(frame,{technicals,load:async ticker=>{fetches++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,1));active--;return {ticker}},calculate:(c,t,o)=>{calculations++;return {plan:{quantity:1},technical:{currency:'USD',quoteTime:Date.now()/1000,sessionOpen:true,price:100}}}});
assert.equal(result.plans.length,230);assert.equal(fetches,50);assert.equal(calculations,230);assert(maxActive<=4);
const again=await computeReview(frame,{technicals,load:async()=>{throw Error('Already fetched')},calculate:()=>({plan:{},technical:{}})});assert.equal(again.plans.length,230);
const partial=await computeReview(frame,{load:async ticker=>{if(ticker==='STOCK0')throw new MonitorError('Price source timed out',{code:'PRICE_TIMEOUT',retryable:true});return {}},calculate:()=>({plan:{},technical:{}})});assert.equal(partial.unavailable,5,'One failed stock affects its five portfolio plans, without discarding healthy results');
const expired=await computeReview({...frame,expiresAt:new Date(Date.now()+1000).toISOString()},{load:async()=>{throw Error('No work after deadline')},calculate:()=>{throw Error('No draft without data')}});assert.equal(expired.unavailable,230);
let candleCalls=0;const provider=async()=>{candleCalls++;if(candleCalls===1)return new Response('',{status:503});return Response.json({chart:{result:[{meta:{},timestamp:[],indicators:{quote:[]}}]}})};
await technicalForStock('AAA',{fetcher:provider,sleep:async()=>{},snapshot:()=>({ok:true})});assert.equal(candleCalls,4,'One transient chart failure retries only that chart');
let rateCalls=0;await assert.rejects(()=>technicalForStock('AAA',{fetcher:async()=>{rateCalls++;return new Response('',{status:429,headers:{'Retry-After':'60'}})},sleep:async()=>{},snapshot:()=>({})}));assert.equal(rateCalls,3,'A long provider rate limit is deferred, not immediately hammered');
// Stress the new topology with random failures and checkpoint reuse, without external services.
let totalPlans=0;for(let pass=0;pass<200;pass++){
 const stockCount=1+pass%60,pairs=Array.from({length:230},(_,i)=>({ticker:'T'+i%stockCount,portfolio:'P'+i%5})),counts=new Map();
 const r=await computeReview({targets:pairs,expiresAt:new Date(Date.now()+600000).toISOString()},{load:async t=>{counts.set(t,(counts.get(t)||0)+1);if((Number(t.slice(1))+pass)%17===0)throw Error('Injected outage');return {}},calculate:()=>({plan:{canDraft:false},technical:{}})});
 assert.equal(r.plans.length,230);assert([...counts.values()].every(n=>n===1));totalPlans+=r.plans.length;
}
// A process restart resumes the durable frame and stock results, without rebuilding the snapshot.
const dir=await mkdtemp(join(tmpdir(),'arthapalana-review-'));
try{
 const path=join(dir,'checkpoint.json'),store=new Checkpoint(path);await store.save({claimId:'claim-for-resume-000000',job:{reviewId:'review1'},prepared:{newsTickers:['AAA']},events:[{ticker:'AAA'}],frame:{targets:[{ticker:'AAA',portfolio:'P'}],expiresAt:new Date(Date.now()+600000).toISOString()},technicals:{AAA:{value:{}}}});
 assert.equal((await stat(path)).mode&0o777,0o600);const resumed=new Checkpoint(path);await resumed.load();let prepares=0,contexts=0,complete=0;
 const fakeClient={call:async(operation,b)=>{if(operation==='claim')return {job:{lease:'lease1',reviewId:'review1',phase:'ready',expiresAt:new Date(Date.now()+600000).toISOString()}};if(operation==='prepare'){prepares++;return {newsTickers:['AAA'],needDiscovery:false}}if(operation==='events')return {ok:true};if(operation==='context'){contexts++;throw Error('Frame already persisted')}if(operation==='finish'){complete++;return {ok:true}}return {ok:true}}};
 await runMarketCycle({client:fakeClient,checkpoint:resumed,python:async()=>{throw Error('Events already saved')},engine:{executionFromContext:()=>({plan:{},technical:{}})},loadTechnical:async()=>{throw Error('Stock already saved')}});
 assert.equal(prepares,1);assert.equal(contexts,0);assert.equal(complete,1);assert.equal(JSON.parse(await readFile(path,'utf8')),null);
}finally{await rm(dir,{recursive:true,force:true})}
console.log(`PASS: stable retries, explicit logs, non-retriable errors, heartbeat loss, 230 plans/50 technical calculations, bounded concurrency, partial outages, time budgets, provider rate limits, ${totalPlans} stress plans and durable restart recovery.`);

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,Log,LogLevel} from 'miniflare';
const unsafe=`let pending;export default {async fetch(request){if(new URL(request.url).pathname==='/abandon')pending=new Promise(()=>{});return new Response(await (pending||Promise.resolve('fresh')));}}`;
async function check(script,safe){
 const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],log:new Log(LogLevel.NONE)});
 try{
  await mf.ready;
  await assert.rejects(async()=>{const r=await mf.dispatchFetch('http://cache.test/abandon',{signal:AbortSignal.timeout(250)});if(!r.ok)throw Error('Canceled');await r.text();},'The originating request is intentionally cancelled');
  if(!safe){await assert.rejects(async()=>{const r=await mf.dispatchFetch('http://cache.test/recover',{signal:AbortSignal.timeout(1500)});if(!r.ok)throw Error('Hung request');await r.text();},'Unsafe cache retains an abandoned request');return;}
  const next=await mf.dispatchFetch('http://cache.test/recover',{signal:AbortSignal.timeout(3000)});assert.equal(next.status,200);assert.equal((await next.json()).value,'recovered');
  const again=await mf.dispatchFetch('http://cache.test/recover',{signal:AbortSignal.timeout(3000)});assert.equal(again.status,200);assert.equal((await again.json()).value,'recovered');
 }finally{await mf.dispose()}
}
await check(unsafe,false);
await check(readFileSync('/tmp/arthapalana-cache-worker.mjs','utf8'),true);
console.log('PASS: workerd reproduces a hung cache after request cancellation; the request-scoped cache recovers and reuses completed values.');

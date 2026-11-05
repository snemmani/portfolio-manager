import assert from 'node:assert/strict';
import {watchWebHealth} from '../docker/web-health.mjs';
let time=0,restarts=0,ok=true;
const monitor=watchWebHealth({onUnhealthy:()=>restarts++,now:()=>time,warmupMs:100,intervalMs:100000,fetcher:async()=>{if(!ok)throw Error('hung runtime');return new Response('ok')}});
try{
 ok=false;await monitor.probe();assert.equal(restarts,0,'Startup gets a grace period');time=101;
 await monitor.probe();await monitor.probe();assert.equal(restarts,0,'Transient failures do not restart the web service');
 ok=true;await monitor.probe();ok=false;await monitor.probe();await monitor.probe();assert.equal(restarts,0,'A healthy result resets the failure count');
 await monitor.probe();assert.equal(restarts,1);await monitor.probe();assert.equal(restarts,1,'One unhealthy episode triggers one restart');
}finally{monitor.stop()}
console.log('PASS: web watchdog warmup, transient failure tolerance, healthy reset and restart on persistent unresponsiveness.');

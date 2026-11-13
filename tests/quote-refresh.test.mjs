import assert from 'node:assert/strict';
import {quote} from '/tmp/arthapalana-data-integrity.mjs';
const RealDate=Date;let now=RealDate.parse('2026-11-11T08:00:00+05:30'),price=100,calls=[],failPrimary=false,failAll=false,quoteTime=RealDate.parse('2026-11-09T15:28:22+05:30')/1000;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
globalThis.fetch=async url=>{
 const u=new URL(url);calls.push(u);if(failAll||failPrimary&&u.hostname.startsWith('query1'))throw Error('Synthetic feed outage');
 return Response.json({chart:{result:[{meta:{currency:'INR',regularMarketPrice:price,regularMarketTime:quoteTime},timestamp:[now/1000-86400,now/1000],indicators:{quote:[{close:[99,100]}]}}]}});
};
try{
 const first=await quote('REFRESH.NS');assert.equal(first.price,100);assert.equal(first.stale,false);assert.equal(calls.length,2);
 await quote('REFRESH.NS','1d');assert.equal(calls.length,2,'Every range shares current quote metadata');
 price=101;now+=61000;const next=await quote('REFRESH.NS');assert.equal(next.price,101);assert.equal(calls.length,3);assert.equal(calls.at(-1).searchParams.get('range'),'1d','History is not downloaded on each price refresh');
 now=RealDate.parse('2026-11-11T09:44:50+05:30');assert.equal((await quote('BOUNDARY.NS','1d')).stale,false);const count=calls.length;now+=15000;assert.equal((await quote('BOUNDARY.NS','1d')).stale,true);assert.equal(calls.length,count,'Cached metadata freshness is recomputed after reopening');
 failPrimary=true;assert.equal((await quote('FALLBACK.NS','1d')).price,101);assert.equal(calls.at(-1).hostname,'query2.finance.yahoo.com');
 failAll=true;const unavailable=await quote('OFFLINE.NS','1d');assert.equal(unavailable.price,null);assert.equal(unavailable.stale,true);assert.match(unavailable.error,/Both Yahoo/);
 assert.equal(calls.filter(u=>u.pathname.includes('OFFLINE')).length,2,'Retries remain bounded');
failAll=false;failPrimary=false;quoteTime=now/1000-80*60;const fx=await quote('USDINR=X','1d');assert.equal(fx.stale,false,'Business-day FX is not subject to equity intraday age');assert.equal(fx.time,quoteTime,'The source FX timestamp is preserved');
}finally{globalThis.Date=RealDate;}
console.log('PASS: minute quote updates, shared ranges, independent history, cached freshness at reopen, second-host recovery and bounded fail-closed outages. No external requests.');

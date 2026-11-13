import assert from 'node:assert/strict';
import {createResource} from '../lib/client/resource-store';
let calls=0,resolve:any;const fetcher:any=()=>{calls++;return new Promise(r=>resolve=r)};
const resource=createResource('/test',fetcher),unsubscribe=resource.subscribe(()=>{});
const first=resource.refresh(),same=resource.refresh(true);assert.equal(calls,1);resolve(Response.json({value:1}));await Promise.all([first,same]);assert.equal(resource.getSnapshot().data.value,1);assert.equal(resource.getSnapshot().loading,false);
let fail=false;const retained=createResource('/retained',(async()=>{if(fail)throw Error('Network disconnected');return Response.json({value:42})}) as any);await retained.refresh();fail=true;await retained.refresh(true);assert.equal(retained.getSnapshot().data.value,42);assert.match(retained.getSnapshot().error,/disconnected/);assert(!retained.getSnapshot().loading);
const old=resource.refresh(true);const oldResolve=resolve;unsubscribe();const again=resource.subscribe(()=>{}),newer=resource.refresh(true);resolve(Response.json({value:3}));await newer;oldResolve(Response.json({value:2}));await old;assert.equal(resource.getSnapshot().data.value,3,'Unmounted/late work cannot replace newer data');again();
const timed=createResource('/timeout',((_url:any,init:any)=>new Promise((_r,j)=>init.signal.addEventListener('abort',()=>j(Object.assign(Error('Aborted'),{name:'AbortError'}))))) as any);await timed.refresh(true,10);assert.match(timed.getSnapshot().error,/timed out/);assert(!timed.getSnapshot().loading);
console.log('PASS: client request deduplication, retained data after failure, bounded timeout, unmount cancellation and late-response isolation.');
let malformed=false;const contract=createResource('/api/portfolio',(async()=>Response.json(malformed?{holdings:[null],portfolios:[]}:{holdings:[],portfolios:[],totals:{}})) as any);await contract.refresh();malformed=true;await contract.refresh(true);assert.deepEqual(contract.getSnapshot().data.holdings,[]);assert.match(contract.getSnapshot().error,/incomplete/);
// Report changes and completion must invalidate the index and every summary.
const {apiResource,invalidateFinancialResources}=await import('../lib/client/resource-store');
const originalFetch=globalThis.fetch;let version=1;
try{
 globalThis.fetch=async()=>Response.json({version});
 const paths=['/api/annual-reports','/api/annual-reports/report1/summary'];
 const rs=paths.map(apiResource),offs=rs.map(r=>r.subscribe(()=>{}));
 await Promise.all(rs.map(r=>r.refresh()));version=2;invalidateFinancialResources();
 await Promise.all(rs.map(r=>r.refresh()));rs.forEach(r=>assert.equal(r.getSnapshot().data.version,2));offs.forEach(off=>off());
}finally{globalThis.fetch=originalFetch;}
// An older response already in flight cannot undo report invalidation.
const race=createResource('/race',fetcher),stop=race.subscribe(()=>{});const before=race.refresh(),beforeResolve=resolve;race.invalidate();resolve(Response.json({value:5}));await race.refresh();beforeResolve(Response.json({value:4}));await before;assert.equal(race.getSnapshot().data.value,5);stop();

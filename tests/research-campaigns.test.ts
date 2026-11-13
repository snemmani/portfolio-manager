import assert from 'node:assert/strict';
import {campaignWork} from '../lib/research-campaigns';
import {storedFundamental} from './fundamental-fixture.mjs';
const snap:any={holdings:[],fx:85,portfolios:[{name:'India',value:100000,cash:20000,complete:true}]};
const discovery={candidates:Array.from({length:19},(_,i)=>({ticker:'C'+i+'.NS',status:'eligible',currency:'INR',price:100,metrics:{statementDate:'2026-03-31',roce:30-i/2}}))},context={portfolio:'India',market:'India'},reviews:any={};
const supported=(ticker:string)=>{const r:any=storedFundamental(ticker);Object.assign(r,{policyVersion:'materiality-v2',accountingQuality:'clean',blockingReasons:[]});r.areas.forEach((a:any)=>a.sourceBacked=true);return r};
for(const ticker of ['C0.NS','C1.NS'])reviews[ticker]=supported(ticker);
let result=campaignWork([],snap,discovery,reviews,[],context);assert.equal(result.work.filter((w:any)=>w.state==='completed').length,2);assert.equal(result.work.filter((w:any)=>w.state==='pending').length,17);
const visited=new Set();let slots=0;
while(result.next.length){slots++;for(const t of result.next){assert(!visited.has(t),'A completed case cannot monopolise later scheduled slots');visited.add(t);reviews[t]=supported(t);const w=result.work.find((w:any)=>w.ticker===t)!;w.attempts++;w.lastAttemptAt=new Date().toISOString();w.state='completed';}result=campaignWork(JSON.parse(JSON.stringify(result.work)),snap,discovery,reviews,[],context);assert(slots<12);}
assert.equal(visited.size,17);assert.equal(slots,9,'Four slots of two companies require nine batches for the remaining seventeen');assert.equal(result.work.filter((w:any)=>w.state==='completed').length,19);
const emptyReviews:any={},first=campaignWork([],snap,discovery,emptyReviews,[],context);const failed=first.work[0];failed.state='failed';failed.attempts=1;failed.lastAttemptAt=new Date(Date.now()-2*86400000).toISOString();const later=campaignWork(first.work,snap,discovery,{},[],context);assert(!later.next.includes(failed.ticker),'Untouched companies advance ahead of a retry, even on the next day');
for(const w of first.work)w.state='completed';first.work.forEach((w:any)=>emptyReviews[w.ticker]=supported(w.ticker));delete emptyReviews[failed.ticker];failed.state='failed';failed.attempts=3;assert.equal(campaignWork(first.work,snap,discovery,emptyReviews,[],context).next.length,0,'Repeated failures stop until new evidence arrives');
const changed=campaignWork(first.work,snap,discovery,emptyReviews,[{ticker:failed.ticker,id:'new',sha256:'new',period:'2026-03-31'}],context);assert(changed.next.includes(failed.ticker),'A new report reopens an evidence-blocked company');
console.log('PASS: persistent nineteen-company worklist, seventeen remaining cases advance in nine bounded batches, restart preservation, no repeat of completed cases, untouched-before-retry fairness, retry limit and new-evidence reset.');

const resetSource=campaignWork(first.work,snap,discovery,{},[{ticker:failed.ticker,id:'another',sha256:'another',period:'2026-03-31'}],context);const reopened=resetSource.work.find((w:any)=>w.ticker===failed.ticker)!;assert(reopened.totalAttempts>=1);assert.equal(reopened.attempts,0,'New evidence resets the retry limit without erasing earlier work history.');
// The public preview includes due retries in exactly the order used to claim work.
const {campaignSummary,campaignQueue}=await import('../lib/research-campaigns');
const queueNow=Date.now(),work=[
 {ticker:'RETRY',state:'failed',attempts:1,totalAttempts:1,lastAttemptAt:new Date(queueNow-86400001).toISOString()},
 {ticker:'WAIT',state:'needs_evidence',attempts:1,totalAttempts:1,lastAttemptAt:new Date(queueNow-1000).toISOString()},
 {ticker:'LIMIT',state:'failed',attempts:3,totalAttempts:3,lastAttemptAt:new Date(queueNow-86400001).toISOString()},
 {ticker:'NEW',state:'pending',attempts:0,totalAttempts:0,researchScore:22,rankReason:'Cash conversion 1.5×'},
];
const preview=campaignSummary({id:'test',work_json:JSON.stringify(work),enabled:1});
assert.deepEqual(preview.next,['NEW','RETRY']);assert.deepEqual(preview.queue.map((w:any)=>w.ticker),campaignQueue(work,queueNow).map((w:any)=>w.ticker));
assert.match(preview.queue[0].reason,/Untouched.*Cash conversion/);assert.match(preview.queue[1].reason,/24-hour/);

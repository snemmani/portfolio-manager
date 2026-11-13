import assert from 'node:assert/strict';
import {campaignWork,campaignQueue,mergeLegacyWork,freshCashPortfolios,FRESH_CASH,GLOBAL_QUEUE_ID} from '../lib/research-campaigns';
import {fundamentalScope} from '../lib/fundamental-store';
const now=Date.parse('2026-11-12T09:15:00+05:30'),day=86400000,iso=(t:number)=>new Date(t).toISOString();
const cand=(ticker:string,currency:string,price:number,roce:number)=>({ticker,name:ticker,status:'eligible',currency,price,metrics:{statementDate:'2026-03-31',roce}});
const ctx={intent:'research-queue',campaignId:GLOBAL_QUEUE_ID};

// Merit across markets and portfolios: one list, no portfolio/market filter, no duplicates.
{const snap:any={holdings:[],fx:90,portfolios:[{name:'Small',value:20000,cash:5000,complete:true},{name:'Large',value:2e6,cash:5e5,complete:true}]};
 const discovery={candidates:[cand('LOWQ.NS','INR',50,5),cand('HIGHQ.NS','INR',5000,40),cand('US1','USD',100,35),cand('MID.NS','INR',800,20)]};
 const r=campaignWork([],snap,discovery,{},[],ctx,now);
 assert.deepEqual(r.work.map((w:any)=>w.ticker),['HIGHQ.NS','US1','MID.NS','LOWQ.NS'],'business quality orders both markets together');
 assert.deepEqual(r.next,['HIGHQ.NS','US1'],'a US company competes on merit');
 assert.deepEqual(r.work.find((w:any)=>w.ticker==='LOWQ.NS').affordableFor.sort(),['Large','Small'],'portfolios are buyers, not separate queues');
 assert.deepEqual(r.work.find((w:any)=>w.ticker==='HIGHQ.NS').affordableFor,['Large'],'eligibility needs only one portfolio able to buy');
 assert.equal(new Set(r.work.map((w:any)=>w.ticker)).size,r.work.length);
 // Nothing affordable anywhere → not queued.
 assert(!campaignWork([],{...snap,portfolios:snap.portfolios.map((p:any)=>({...p,cash:0}))},discovery,{},[],ctx,now).work.length);}

// Fresh cash: small boost, breaks near-ties, never lifts a weak business over a strong one.
{const base={holdings:[],fx:90},discovery={candidates:[cand('A.NS','INR',3000,30),cand('B.NS','INR',100,29),cand('WEAK.NS','INR',100,10)]};
 const portfolios=(deposit:number|null)=>[{name:'Large',value:2e6,cash:5e5,complete:true,lastDepositAt:iso(now-60*day)},{name:'Fresh',value:20000,cash:5000,complete:true,lastDepositAt:deposit===null?null:iso(deposit)}];
 const stale=campaignWork([],{...base,portfolios:portfolios(now-30*day)},discovery,{},[],ctx,now);assert.deepEqual(stale.next,['A.NS','B.NS']);
 const fresh=campaignWork([],{...base,portfolios:portfolios(now-2*day)},discovery,{},[],ctx,now);
 assert.deepEqual(fresh.next,['B.NS','A.NS'],'a recent deposit lifts a near-tie the fresh portfolio can buy');
 assert.deepEqual(fresh.work.find((w:any)=>w.ticker==='B.NS').freshCash,['Fresh']);
 assert(fresh.work.findIndex((w:any)=>w.ticker==='WEAK.NS')>fresh.work.findIndex((w:any)=>w.ticker==='A.NS'),'boost is not decisive against quality');
 assert.equal(fresh.work.find((w:any)=>w.ticker==='B.NS').priority-stale.work.find((w:any)=>w.ticker==='B.NS').priority,FRESH_CASH.bonus);
 for(const t of [iso(now+5*day),'not a date',null])assert(!freshCashPortfolios({portfolios:[{name:'X',cash:1,complete:true,lastDepositAt:t}]},now).size,'future or invalid deposit dates give no boost');
 assert(!freshCashPortfolios({portfolios:[{name:'X',cash:0,complete:true,lastDepositAt:iso(now)}]},now).size,'no cash, no boost');}

// Slots: a claimed-seat count never strands queued companies.
{const snap:any={holdings:[],fx:90,portfolios:[{name:'P',value:1e6,cash:1e5,complete:true}]},discovery={candidates:[cand('X1.NS','INR',100,30),cand('X2.NS','INR',100,20)]};
 assert.deepEqual(campaignWork([],snap,discovery,{},[],ctx,now,1).next,['X1.NS']);
 assert.deepEqual(campaignWork([],snap,discovery,{},[],ctx,now,0).next,[]);}

// Holding seat: a stale holding takes one seat, the queue fills the rest; claimed tickers are kept.
{const snap:any={holdings:[{ticker:'HELD.NS',portfolio:'P',currency:'INR',price:100,value:5000,fundamentals:{date:'2026-03-31'}}],portfolios:[{name:'P',value:1e6,cash:1e5,complete:true}]};
 const discovery={candidates:[cand('Q1.NS','INR',100,30),cand('Q2.NS','INR',100,20)]};
 const scope=(request:any)=>fundamentalScope(snap,discovery,{},undefined,2,[],{...ctx,...request}).map((s:any)=>s.ticker);
 assert.deepEqual(scope({tickers:['Q1.NS'],holdingCooldown:[]}),['HELD.NS','Q1.NS']);
 assert.deepEqual(scope({tickers:['Q1.NS','Q2.NS'],holdingCooldown:[]}),['Q1.NS','Q2.NS'],'claimed companies are never displaced');
 assert.deepEqual(scope({tickers:['Q1.NS'],holdingCooldown:['HELD.NS']}),['Q1.NS'],'a holding attempted in the last 24 hours waits');
 assert.deepEqual(scope({tickers:['Q1.NS']}),['Q1.NS'],'no seat unless the caller checked cooldowns');}

// Legacy campaigns merge: newest state per company, highest attempt counts, stale running → failed.
{const t1=iso(now-3*day),t2=iso(now-1*day),old=iso(now-2*day);
 const merged=mergeLegacyWork([[{ticker:'A',state:'needs_evidence',attempts:2,totalAttempts:2,lastAttemptAt:t1},{ticker:'B',state:'running',attempts:1,totalAttempts:1,lastAttemptAt:old}],[{ticker:'A',state:'failed',attempts:1,totalAttempts:3,lastAttemptAt:t2},{ticker:'C',state:'pending',attempts:0,totalAttempts:0,lastAttemptAt:null}],[{ticker:'C',state:'paused',attempts:0,totalAttempts:0,lastAttemptAt:null}]]);
 const by=Object.fromEntries(merged.map((w:any)=>[w.ticker,w]));
 assert.equal(by.A.state,'failed');assert.equal(by.A.attempts,2);assert.equal(by.A.totalAttempts,3);assert.equal(by.A.lastAttemptAt,t2,'retry wait uses the latest attempt');
 assert.equal(by.C.state,'pending','pending outranks paused at equal time');assert.equal(merged.length,3);
 assert.deepEqual(campaignQueue(merged,now).map((w:any)=>w.ticker),['C','A'],'a retry still waits for 24 hours and follows untouched work');}
console.log('PASS: one global research queue ranks both markets on business quality, portfolios only gate affordability, fresh deposits give a bounded boost, holdings take one seat without stranding claims, and legacy campaigns merge without resetting retry limits.');

import assert from 'node:assert/strict';
import {planDiscovery} from '../lib/discovery';
import {technicalSnapshot,cleanCandles} from '../lib/technicals';
import {tradeSummary} from '../lib/trade-summary';
import {researchSlot} from '../lib/research-schedule';
let seed=31177;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const time=Date.now()/1000,event={ok:true,checkedAt:new Date().toISOString(),issues:[],fingerprint:'clear'};
for(let run=0;run<5000;run++){
 const value=10000+random()*1000000,cash=random()*value,p={name:'Test',value,cash,complete:true},budget=random()*value;
 const candidates=Array.from({length:1+Math.floor(random()*20)},(_,i)=>({ticker:'S'+i+'.NS',currency:'INR',market:'IN',category:random()<.3?'C':'B',sector:['Technology','Industrials','Commodities'][Math.floor(random()*3)],status:'eligible',price:1+random()*20000,quoteTime:time}));
 const ideas=candidates.map(c=>({portfolio:'Test',ticker:c.ticker,market:'IN',decision:'enter',targetWeightPct:5+random()*10,conviction:random()<.5?'low':'medium',thesis:'Numerical test'}));
 const d={rulesBased:true,asOf:new Date().toISOString(),events:Object.fromEntries(candidates.map(c=>[c.ticker,event])),candidates,combinedTotal:value};
 const a=planDiscovery(p,[],budget,'India',d,ideas),total=a.allocations.reduce((s:any,x:any)=>s+x.amount,0);
 assert(total<=Math.min(cash,budget)+1e-6);assert(a.reserve>=-1e-6);assert(Math.abs(total+a.reserve-a.budget)<1e-6);
 assert.equal(new Set(a.allocations.map((x:any)=>x.ticker)).size,a.allocations.length);
 for(const x of a.allocations){assert(Number.isFinite(x.quantity)&&Number.isInteger(x.quantity)&&x.quantity>0);assert(x.amount<=value*.15+1e-6);}
 const amount=(f:(c:any)=>boolean)=>a.allocations.filter((x:any)=>f(candidates.find(c=>c.ticker===x.ticker))).reduce((s:any,x:any)=>s+x.amount,0);
 assert(amount(c=>['Industrials','Commodities'].includes(c.sector))<=value*.25+1e-6);assert(amount(c=>c.sector==='Commodities')<=value*.20+1e-6);assert(amount(c=>c.category==='C')<=value*.15+1e-6);
}
const p={name:'Test',value:10000,cash:5000,complete:true},c={ticker:'AAA.NS',market:'IN',currency:'INR',price:100,quoteTime:time,status:'eligible',sector:'Technology',category:'B'};
const d={rulesBased:true,asOf:new Date().toISOString(),events:{'AAA.NS':event},candidates:[c]},idea={portfolio:'Test',ticker:c.ticker,market:'IN',decision:'enter',conviction:'medium',targetWeightPct:10,thesis:'Test'};
assert.equal(planDiscovery(p,[],5000,'India',d,[idea,idea]).allocations.length,1,'Duplicate cached ideas cannot allocate twice');
for(const price of [NaN,Infinity,-5,0])assert.equal(planDiscovery(p,[],5000,'India',{...d,candidates:[{...c,price}]},[idea]).allocations.length,0);
assert.equal(planDiscovery(p,[],5000,'India',d,[{...idea,targetWeightPct:NaN}]).allocations.length,0);
assert.equal(planDiscovery(p,[],5000,'India',{...d,householdComplete:false},[idea]).allocations.length,0);
const bar={time:time-86400,open:100,high:102,low:98,close:100,volume:100};assert.equal(cleanCandles(Array(100).fill(bar)).length,1);
const intraday=Array.from({length:12},(_,i)=>({...bar,time:time-3600+i*300})),meta={currency:'INR',regularMarketPrice:100,regularMarketTime:time,currentTradingPeriod:{regular:{start:time-3600,end:time+3600}},exchangeTimezoneName:'Asia/Kolkata'};
assert(!technicalSnapshot(Array(100).fill(bar),intraday,meta).sufficient);
assert(!technicalSnapshot(Array.from({length:100},(_,i)=>({...bar,time:time-(200-i)*86400})),intraday,meta).sufficient,'Ancient daily evidence cannot enable a current-session draft');
assert.equal(technicalSnapshot([],[],{...meta,regularMarketPrice:Infinity}).price,null);
const ready={plan:{side:'buy',authorized:true,quantity:1,limit:100,canDraft:true,validUntil:new Date(Date.now()+60000).toISOString()},technical:{currency:'INR',sessionOpen:true,quoteTime:time}};
assert(tradeSummary(ready,'buy').ready);assert(!tradeSummary({...ready,technical:{...ready.technical,quoteTime:time-21*60}},'buy').ready);assert(!tradeSummary({...ready,technical:{...ready.technical,quoteTime:time+120}},'buy').ready);assert(!tradeSummary({...ready,plan:{...ready.plan,quantity:Infinity}},'buy').show);
for(let day=0;day<14;day++){const slots=new Set();for(let minute=0;minute<1440;minute++){const slot=researchSlot(Date.parse('2026-11-01T00:00:00+05:30')+day*86400000+minute*60000);if(slot)slots.add(slot);}assert(slots.size===0||slots.size===4);}
console.log('PASS: 5,000 random cash plans conserve cash, whole shares and all exposure caps; duplicate ideas, malformed numbers, incomplete household data, repeated/ancient candles, fresh-order guards and two weeks of AI scheduling.');

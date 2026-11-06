import assert from 'node:assert/strict';
import {rsiWilder,atrWilder,cleanCandles,technicalSnapshot,pricePlan,longTermStructure} from '../lib/technicals';
assert.ok(Math.abs(rsiWilder([44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28])!-70.464135)<.0001);
assert.equal(rsiWilder(Array.from({length:20},()=>100)),50);assert.equal(rsiWilder(Array.from({length:20},(_,i)=>i+1)),100);assert.equal(rsiWilder([1,2]),null);
const candle=(time:number,close=100,volume=100)=>({time,open:close,high:close+2,low:close-2,close,volume});
assert.equal(atrWilder(Array.from({length:30},(_,i)=>candle(i*86400))),4);
assert.equal(cleanCandles([candle(2),{...candle(1),close:null},candle(0)]).length,2);
const start=Date.parse('2026-11-03T14:30:00Z')/1000,now=(start+3600)*1000;
const daily=Array.from({length:60},(_,i)=>candle(start-(60-i)*86400));
const intra=Array.from({length:13},(_,i)=>candle(start+i*300,100,100));
const meta={symbol:'AAA',currency:'USD',regularMarketPrice:100,regularMarketTime:start+3590,exchangeTimezoneName:'America/New_York',currentTradingPeriod:{regular:{start,end:start+23400}}};
const t=technicalSnapshot([...daily,candle(start,200)],intra,meta,now);
assert.equal(t.dailySessions,60);assert.equal(t.intradayBars,12);assert.equal(t.vwap,100);assert.equal(t.rsi14,50);assert.equal(t.sessionOpen,true);assert.equal(t.fresh,true);assert.equal(t.atr14,4);
const stale=technicalSnapshot(daily,intra,{...meta,regularMarketTime:start},now);assert.equal(stale.fresh,false);
const closed=technicalSnapshot(daily,intra,meta,(start+24000)*1000);assert.equal(closed.sessionOpen,false);
const base={...t,price:100,atr14:2,trend:'rising',rsi14:50,sma20:99,sma50:98,sma200:90,vwap:99,levels:{pivot:99,s1:98,s2:97,low20:95,sessionLow:98,r1:104,r2:106,high20:110,sessionHigh:104},sessionOpen:true,fresh:true,sufficient:true,largeGap:false,reasons:[]};
let plan=pricePlan(base,{side:'buy',authorized:true});assert.equal(plan.canDraft,true,plan.status);assert.ok(plan.invalidation!<plan.limit!);assert.ok(plan.target1!>plan.limit!);assert.ok(plan.supportSignals.length,'Holding the 50-day average is a support signal');assert.ok(Number.isFinite(plan.rewardRisk),'Reward/risk is reported, not a gate');
assert.equal(pricePlan(base,{side:'buy',authorized:false}).canDraft,false);
assert.equal(pricePlan({...base,sessionOpen:false},{side:'buy',authorized:true}).canDraft,false);
// No sign of support → wait; a falling short-term trend alone is not a blocker.
plan=pricePlan({...base,recentCloses:[99,97,97],rsiMin10:48,reclaimed50:false,regime:'transition'},{side:'buy',authorized:true});assert.equal(plan.canDraft,false);assert.match(plan.status,/no sign of support/);
assert.equal(pricePlan({...base,trend:'falling'},{side:'buy',authorized:true}).canDraft,true,'Short-term trend is not a buy gate');
// RSI recovering from oversold is a support signal; a falling 200-day regime is a warning.
plan=pricePlan({...base,recentCloses:[99,97,97],rsiMin10:28,rsi14:36,regime:'downtrend'},{side:'buy',authorized:true});assert.equal(plan.canDraft,true);assert.ok(plan.supportSignals.some((x:string)=>x.startsWith('RSI recovering')));assert.ok(plan.technicalWarnings.some((x:string)=>x.includes('falling 200-day')));
// Far above support → wait for a pullback.
assert.equal(pricePlan({...base,price:104,recentCloses:[104,104,104]},{side:'buy',authorized:true}).canDraft,false);
assert.equal(pricePlan({...base,fresh:false},{side:'sell',authorized:true}).canDraft,false);
assert.equal(pricePlan(base,{side:'sell',authorized:true,locked:true}).limit,null);
plan=pricePlan(base,{side:'sell',authorized:true,manualExit:true});assert.equal(plan.limit,100);assert.equal(plan.canDraft,true);assert.match(plan.status,/Your full-exit/);
// Long-term structure: a steady 40% rise over a year sets an uptrend and over-extension trim signals.
const day=86400,rise=Array.from({length:260},(_,i)=>{const c=100*(1+i*0.0035)+(i%7===0?-1.5:0);return {time:start-(260-i)*day,open:c-0.5,high:c+1,low:c-1,close:c,volume:i===259?300000:100000};});
const st=longTermStructure(cleanCandles(rise),190,2,175,150,Array.from({length:260},(_,i)=>({time:start-(260-i)*day,open:100,high:101,low:99,close:100+i*0.01,volume:1})));
assert.equal(st.regime,'uptrend');assert.ok(st.extension200Pct!>=25);assert.ok(st.extension.stage>=1);assert.ok([10,20].includes(st.extension.trimPct));assert.ok(st.relativeStrength3m!>0,'Outperforming a flat index');assert.ok(st.swingSupport===null||st.swingSupport<190);
const flat=longTermStructure(cleanCandles(rise.map(b=>({...b,open:100,high:101,low:99,close:100,volume:100000}))),100,2,100,100,null);assert.equal(flat.extension.stage,0,'No over-extension, no trim signal');assert.equal(flat.relativeStrength3m,null);
console.log('PASS: Wilder RSI/ATR, flat/rising prices, missing bars, completed-session isolation, VWAP, provider sessions, stale quotes, closed sessions, conditional buy gates, locked positions and manual exit labels.');

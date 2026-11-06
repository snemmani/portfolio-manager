export type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
const finite=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const round=(n:number|null)=>n===null?null:Math.round(n*100)/100;
export function cleanCandles(input:any[]):Candle[]{return [...new Map(input.filter(b=>finite(b.time)&&finite(b.open)&&finite(b.high)&&finite(b.low)&&finite(b.close)&&b.low>0&&b.open>0&&b.open>=b.low-.001&&b.open<=b.high+.001&&b.high>=b.low&&b.close>=b.low-.001&&b.close<=b.high+.001).map(b=>({...b,volume:finite(b.volume)&&b.volume>0?b.volume:0})).map(b=>[b.time,b] as const)).values()].sort((a,b)=>a.time-b.time);}
export function rsiWilder(closes:number[],period=14){if(closes.length<period+1)return null;let gain=0,loss=0;for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}gain/=period;loss/=period;for(let i=period+1;i<closes.length;i++){const d=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period;}return gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);}
export function atrWilder(bars:Candle[],period=14){if(bars.length<period+1)return null;const tr=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));let atr=tr.slice(0,period).reduce((a,b)=>a+b,0)/period;for(const v of tr.slice(period))atr=(atr*(period-1)+v)/period;return atr;}
const day=(ts:number,tz:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts*1000));
export function technicalSnapshot(dailyInput:any[],intradayInput:any[],meta:any,now=Date.now(),benchmarkInput?:any[]|null){
 const current=now/1000,regular=meta.currentTradingPeriod?.regular,tz=meta.exchangeTimezoneName||'UTC';
 const sessionOpen=!!regular&&current>=regular.start&&current<regular.end;
 const quoteTime=Number(meta.regularMarketTime)||null,price=Number.isFinite(Number(meta.regularMarketPrice))&&Number(meta.regularMarketPrice)>0?Number(meta.regularMarketPrice):null;
 const quoteAgeSeconds=quoteTime===null?null:current-quoteTime;
 const daily=cleanCandles(dailyInput).filter(b=>b.time<=(sessionOpen?regular.start-1:current));
 const sessionDate=quoteTime?day(quoteTime,tz):null;
 const intraday=cleanCandles(intradayInput).filter(b=>b.time+300<=current&&b.volume>0&&sessionDate!==null&&day(b.time,tz)===sessionDate&&(!regular||day(regular.start,tz)!==sessionDate||(b.time>=regular.start&&b.time<regular.end)));
 const lastBar=intraday.at(-1),last=daily.at(-1),close=daily.map(b=>b.close);
 const sma=(n:number)=>close.length>=n?close.slice(-n).reduce((a,b)=>a+b,0)/n:null;
 const atr=atrWilder(daily),rsi=rsiWilder(close),sma20=sma(20),sma50=sma(50),sma200=sma(200);
 const volume=intraday.reduce((s,b)=>s+b.volume,0),vwap=volume>0?intraday.reduce((s,b)=>s+(b.high+b.low+b.close)/3*b.volume,0)/volume:null;
 const pivot=last?(last.high+last.low+last.close)/3:null;
 const levels=last&&pivot!==null?{pivot,s1:2*pivot-last.high,s2:pivot-(last.high-last.low),r1:2*pivot-last.low,r2:pivot+(last.high-last.low),low20:Math.min(...daily.slice(-20).map(b=>b.low)),high20:Math.max(...daily.slice(-20).map(b=>b.high)),sessionLow:intraday.length?Math.min(...intraday.map(b=>b.low)):null,sessionHigh:intraday.length?Math.max(...intraday.map(b=>b.high)):null}:null;
 const fresh=quoteAgeSeconds!==null&&quoteAgeSeconds>=-60&&quoteAgeSeconds<=20*60&&!!lastBar&&current-(lastBar.time+300)<=20*60;
 const dailyCurrent=!!last&&current-last.time<=7*86400;
 const sufficient=dailyCurrent&&daily.length>=50&&atr!==null&&atr>0&&intraday.length>=3&&vwap!==null;
 const reasons=[];
 if(!sessionOpen)reasons.push('Regular market session is closed or not confirmed. Levels are a preview; refresh at the next session.');
 if(!fresh&&sessionOpen)reasons.push('Quote or intraday bars are too old for a current-session order draft.');
 if(!sufficient)reasons.push('At least 50 distinct daily sessions with a latest bar from the last seven days, a usable ATR, and three completed 5-minute bars with volume are required.');
 const gap=price!==null&&last&&atr?Math.abs(price-last.close)/atr:null;
 if(gap!==null&&gap>3)reasons.push('Price is more than 3 daily ATRs from the last completed close. Review news/corporate actions before sizing an order.');
 const structure=longTermStructure(daily,price,atr,sma50,sma200,benchmarkInput?cleanCandles(benchmarkInput).filter(b=>b.time<=current):null);
 return {...structure,asOf:new Date(now).toISOString(),price,currency:meta.currency,quoteTime,quoteAgeSeconds,sessionDate,sessionOpen,sessionStart:regular?.start||null,sessionEnd:regular?.end||null,timeZone:tz,lastBarTime:lastBar?.time||null,dailyThrough:last?.time||null,dailySessions:daily.length,intradayBars:intraday.length,rsi14:round(rsi),atr14:round(atr),sma20:round(sma20),sma50:round(sma50),sma200:round(sma200),vwap:round(vwap),levels:levels?Object.fromEntries(Object.entries(levels).map(([k,v])=>[k,round(v)])):null,trend:sma20!==null&&sma50!==null?(sma20>sma50?'rising':sma20<sma50?'falling':'flat'):'unknown',fresh,sufficient,largeGap:gap!==null&&gap>3,reasons,sourceUrl:'https://finance.yahoo.com/quote/'+encodeURIComponent(meta.symbol||'')+'/chart/',method:'Wilder RSI/ATR(14) daily and weekly; SMA(20/50/200) with 20-session slopes; swing support/resistance (3-bar fractals, 120 sessions); 52-week range; 50-day volume; 3-month strength vs the market index; VWAP from completed 5m bars only refines the day\'s limit. Prices may be delayed.'};
}
export function pricePlan(technical:any,{side,authorized=false,locked=false,manualExit=false,kind}:any){
 const t=technical,price=t.price,atr=t.atr14,l=t.levels;
 const base={side,authorized,manualExit,orderType:'LIMIT',limit:null as number|null,zone:null as number[]|null,invalidation:null as number|null,target1:null as number|null,target2:null as number|null,rewardRisk:null as number|null,canDraft:false,status:'Unavailable',reasons:[...t.reasons],validUntil:t.quoteTime?new Date(Math.min(Date.now()+60000,t.quoteTime*1000+20*60000)).toISOString():null};
 if(locked)return {...base,status:'Locked — non-discretionary holding',reasons:['ORCL ESPP is excluded from buy, trim and exit proposals.']};
 if(!price||!atr||!l||!t.sufficient)return base;
 if(side==='buy')return buyPlan(t,base,authorized);
 if(side==='sell'){
 const support=[l.s1,l.low20,l.sessionLow,t.vwap].filter((v:any)=>finite(v)&&v>0&&v<price);
 return {...base,limit:round(price),zone:[round(Math.max(.01,price-.1*atr))!,round(price+.25*atr)!],invalidation:support.length?round(Math.max(...support)-.25*atr):round(price-atr),canDraft:authorized&&t.sessionOpen&&t.fresh&&!t.largeGap,status:!authorized?'Review only — no verified sell decision':!t.sessionOpen?'Next-session preview':!t.fresh?'Refresh stale data':t.largeGap?'Review abnormal gap':manualExit?'Your full-exit scenario':'Concentration-trim limit draft',reasons:[...base.reasons,manualExit?'This full-exit scenario is your choice, not an AI exit recommendation.':kind==='profit'?profitTrimNote(t):'Risk reduction takes priority over waiting for a rally. The limit reference is the latest quote, not an assumed future price.','The downside level is an alert/invalidation reference, not a stop order.']};
 }
 return {...base,status:'Hold / review — no trade proposed'};
}

// ------------------------------------------------------------------ long-term structure

const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
function rsiSeries(closes:number[],period=14){const out:(number|null)[]=closes.map(()=>null);if(closes.length<period+1)return out;let gain=0,loss=0;for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}gain/=period;loss/=period;const value=()=>gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);out[period]=value();for(let i=period+1;i<closes.length;i++){const d=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period;out[i]=value();}return out;}
const smaAt=(closes:number[],n:number,end:number)=>end>=n?closes.slice(end-n,end).reduce((a,b)=>a+b,0)/n:null;
/** Monday-anchored weekly closes from completed daily bars. */
function weeklyCloses(daily:Candle[]){const weeks=new Map<number,number>();for(const b of daily)weeks.set(Math.floor((b.time/86400+3)/7),b.close);return [...weeks.values()];}
/** Three-bar fractal swing lows/highs over the last 120 sessions. */
function swings(daily:Candle[],k=3,lookback=120){const bars=daily.slice(-lookback),lows:number[]=[],highs:number[]=[];for(let i=k;i<bars.length-k;i++){const around=[...bars.slice(i-k,i),...bars.slice(i+1,i+k+1)];if(around.every(b=>bars[i].low<=b.low)&&bars.slice(i-k,i).some(b=>bars[i].low<b.low))lows.push(bars[i].low);if(around.every(b=>bars[i].high>=b.high)&&bars.slice(i-k,i).some(b=>bars[i].high>b.high))highs.push(bars[i].high);}return {lows,highs};}

/**
 * Daily/weekly structure used for long-term buy-ins and satellite trims: regime from the
 * 200-day average and its slope, weekly RSI, swing support/resistance, 52-week range,
 * volume behaviour and three-month strength relative to the market index.
 */
export function longTermStructure(daily:Candle[],price:number|null,atr:number|null,sma50:number|null,sma200:number|null,benchmark?:Candle[]|null){
 const closes=daily.map(b=>b.close),n=closes.length,last=closes.at(-1)??null,ref=price??last;
 const slope=(len:number)=>{const now=smaAt(closes,len,n),before=smaAt(closes,len,n-20);return now!==null&&before!==null&&before>0?(now/before-1)*100:null;};
 const sma50Slope=slope(50),sma200Slope=slope(200);
 const rsi=rsiSeries(closes),recent=rsi.slice(-10).filter((v):v is number=>v!==null),rsiMin10=recent.length?Math.min(...recent):null;
 const weekly=weeklyCloses(daily),weeklyRsi14=rsiWilder(weekly);
 const year=daily.slice(-252),high52=year.length?Math.max(...year.map(b=>b.high)):null,low52=year.length?Math.min(...year.map(b=>b.low)):null;
 const vols=daily.slice(-50).map(b=>b.volume).filter(v=>v>0),avgVolume50=mean(vols),lastVolume=daily.at(-1)?.volume||0;
 let up=0,down=0;for(let i=Math.max(1,n-20);i<n;i++){if(closes[i]>closes[i-1])up+=daily[i].volume;else if(closes[i]<closes[i-1])down+=daily[i].volume;}
 const {lows,highs}=swings(daily);
 const below=ref!==null?lows.filter(v=>v<ref):[],above=ref!==null?highs.filter(v=>v>ref):[];
 const swingSupport=below.length?Math.max(...below):null;
 const swingResistance=above.length?Math.min(...above):high52!==null&&ref!==null&&high52>ref?high52:null;
 const regime=ref===null||sma200===null||sma50===null?'unknown':ref>sma200&&sma50>sma200&&(sma200Slope??0)>=0?'uptrend':ref<sma200&&sma50<sma200&&(sma200Slope??0)<0?'downtrend':'transition';
 const above50Now=last!==null&&sma50!==null&&last>sma50;
 const wasBelow50=Array.from({length:5},(_,i)=>n-2-i).some(i=>{const avg=smaAt(closes,50,i+1);return i>=0&&avg!==null&&closes[i]<avg;});
 let relativeStrength3m:number|null=null;
 if(benchmark&&benchmark.length>63&&n>63){const b=benchmark.map(x=>x.close);relativeStrength3m=((closes[n-1]/closes[n-64]-1)-(b[b.length-1]/b[b.length-64]-1))*100;}
 const extension200Pct=ref!==null&&sma200?(ref/sma200-1)*100:null;
 const nearHigh=ref!==null&&high52!==null&&ref>=high52*0.97;
 // Satellite trim signals (over-extension). One signal → trim 10%; two or more, or >40% above the 200-day → 20%.
 const signals:string[]=[];
 if(extension200Pct!==null&&extension200Pct>=25)signals.push(`Price is ${extension200Pct.toFixed(1)}% above its 200-day average.`);
 if(weeklyRsi14!==null&&weeklyRsi14>=75)signals.push(`Weekly RSI is ${weeklyRsi14.toFixed(1)} (overbought ≥ 75).`);
 const dailyRsi=rsi.at(-1)??null;
 if(dailyRsi!==null&&dailyRsi>=75&&nearHigh)signals.push(`Daily RSI ${dailyRsi.toFixed(1)} at a 52-week high.`);
 if(avgVolume50&&lastVolume>=2.5*avgVolume50&&nearHigh)signals.push(`Volume ${(lastVolume/avgVolume50).toFixed(1)}× the 50-day average at a 52-week high (possible climax).`);
 const stage=signals.length>=2||(extension200Pct!==null&&extension200Pct>=40)?2:signals.length?1:0;
 const r2=(v:number|null)=>v===null?null:round(v);
 return {regime,sma50Slope:r2(sma50Slope),sma200Slope:r2(sma200Slope),weeklyRsi14:r2(weeklyRsi14),rsiMin10:r2(rsiMin10),high52:r2(high52),low52:r2(low52),drawdownPct:ref!==null&&high52?r2((ref/high52-1)*100):null,extension200Pct:r2(extension200Pct),avgVolume50:avgVolume50===null?null:Math.round(avgVolume50),lastVolumeRatio:avgVolume50?r2(lastVolume/avgVolume50):null,upDownVolume20:down>0?r2(up/down):up>0?99:null,swingSupport:r2(swingSupport),swingResistance:r2(swingResistance),reclaimed50:above50Now&&wasBelow50,recentCloses:closes.slice(-5).map(v=>round(v)),relativeStrength3m:r2(relativeStrength3m),extension:{signals,stage,trimPct:stage===2?20:stage===1?10:0}};
}

/**
 * Long-term buy-in: authorised investment case + price within the value ceiling (checked
 * upstream) + a sign of support. Support signals: holding a support level for three
 * sessions, RSI recovering from oversold, reclaiming the 50-day average, or a pullback to
 * the 50-day average in an uptrend. Regime, relative strength, volume and overbought
 * readings are warnings. VWAP only refines the limit during the session.
 */
function buyPlan(t:any,base:any,authorized:boolean){
 const price=t.price,atr=t.atr14,l=t.levels||{};
 const candidates:[number,string][]=([[t.swingSupport,'swing low'],[l.low20,'20-day low'],[t.sma50,'50-day average'],[t.sma200,'200-day average']] as [any,string][]).filter(([v])=>finite(v)&&v>0&&v<=price&&price-v<=3*atr);
 if(!candidates.length)return {...base,blockers:['No support level within three daily ATRs below the price.'],status:'Wait — no support level nearby',reasons:[...base.reasons,'Wait for the price to approach a swing low or a key moving average.']};
 const [support,supportName]=candidates.reduce((a,b)=>b[0]>a[0]?b:a);
 const closes:number[]=Array.isArray(t.recentCloses)?t.recentCloses:[];
 const signals:string[]=[];
 if(closes.length>=3&&Math.min(...closes.slice(-3))>=support&&price<=support+1.5*atr)signals.push(`holding the ${supportName} (${round(support)}) for three sessions`);
 if(finite(t.rsiMin10)&&t.rsiMin10<35&&finite(t.rsi14)&&t.rsi14>30&&t.rsi14>=t.rsiMin10+5)signals.push(`RSI recovering from ${t.rsiMin10} to ${t.rsi14}`);
 if(t.reclaimed50)signals.push('reclaimed the 50-day average');
 if(t.regime==='uptrend'&&finite(t.sma50)&&price<=t.sma50+atr&&price>=t.sma50-0.5*atr)signals.push('pullback to the 50-day average in an uptrend');
 let limit=Math.min(price,support+0.5*atr);
 if(finite(t.vwap)&&t.vwap>=support&&t.vwap<limit)limit=t.vwap;
 const invalidation=Math.max(0.01,support-1.5*atr);
 const target1=finite(t.swingResistance)&&t.swingResistance>limit?t.swingResistance:limit+3*atr,target2=Math.max(target1,finite(t.high52)&&t.high52>limit?t.high52:limit+4*atr);
 const rewardRisk=(target1-limit)/(limit-invalidation),near=price-limit<=atr;
 const warnings=[t.regime==='downtrend'?'Below a falling 200-day average: buy in stages.':null,finite(t.relativeStrength3m)&&t.relativeStrength3m<-10?`Lagging the market index by ${Math.abs(t.relativeStrength3m).toFixed(1)} points over three months.`:null,finite(t.upDownVolume20)&&t.upDownVolume20<0.7?'Selling volume has outweighed buying volume over 20 sessions.':null,finite(t.rsi14)&&t.rsi14>=70?`RSI ${t.rsi14} is overbought; a better entry may come.`:null,finite(t.extension200Pct)&&t.extension200Pct>=25?`Price is ${t.extension200Pct}% above its 200-day average.`:null].filter(Boolean) as string[];
 const signal=signals.length>0,actionable=authorized&&signal&&near&&t.sessionOpen&&t.fresh&&!t.largeGap;
 const blockers=[!authorized?'Required purchase checks have not passed.':null,!signal?'No sign of support yet: wait for the price to hold support, RSI to recover from oversold, or a reclaim of the 50-day average.':null,!near?'The price needs to pull back toward the support zone.':null,t.largeGap?'An abnormal price gap needs review.':null,!t.sessionOpen?'The market is closed; refresh during the next regular session.':!t.fresh?'The quote or intraday candles need refreshing.':null].filter(Boolean) as string[];
 return {...base,blockers,technicalWarnings:warnings,supportSignals:signals,limit:round(limit),zone:[round(support-0.25*atr)!,round(Math.min(price,support+atr))!],invalidation:round(invalidation),target1:round(target1),target2:round(target2),rewardRisk:round(rewardRisk),canDraft:actionable,
  status:!authorized?'Buying paused — required checks have not passed':!signal?'Wait — no sign of support yet':!near?'Wait for a pullback toward support':!t.sessionOpen?'Next-session preview':!t.fresh?'Refresh stale data':t.largeGap?'Review abnormal gap':'Limit-buy draft available',
  reasons:[...base.reasons,`Support: ${supportName} at ${round(support)}${signals.length?`; signal: ${signals.join(', ')}`:''}.`,`Regime ${t.regime||'unknown'}; daily RSI ${t.rsi14}${finite(t.weeklyRsi14)?`, weekly RSI ${t.weeklyRsi14}`:''}${finite(t.relativeStrength3m)?`; ${t.relativeStrength3m>=0?'+':''}${t.relativeStrength3m} points vs the index over 3 months`:''}. A close below ${round(invalidation)} means re-check the timing (not a stop order).`,...warnings,...(!authorized?['A technical setup does not upgrade a watchlist/rejected stock into an approved purchase.']:[])]};
}
function profitTrimNote(t:any){
 const e=t.extension;if(!e?.stage)return 'No over-extension signal: the gain alone does not justify trimming.';
 return `Over-extended (${e.signals.join(' ')}) → staged trim of ${e.trimPct}% of the shares${finite(t.swingResistance)?`; consider laddering the limit up to resistance at ${t.swingResistance}`:''}.`;
}

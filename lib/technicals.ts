export type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
const finite=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const round=(n:number|null)=>n===null?null:Math.round(n*100)/100;
export function cleanCandles(input:any[]):Candle[]{return [...new Map(input.filter(b=>finite(b.time)&&finite(b.open)&&finite(b.high)&&finite(b.low)&&finite(b.close)&&b.low>0&&b.open>0&&b.open>=b.low-.001&&b.open<=b.high+.001&&b.high>=b.low&&b.close>=b.low-.001&&b.close<=b.high+.001).map(b=>({...b,volume:finite(b.volume)&&b.volume>0?b.volume:0})).map(b=>[b.time,b] as const)).values()].sort((a,b)=>a.time-b.time);}
export function rsiWilder(closes:number[],period=14){if(closes.length<period+1)return null;let gain=0,loss=0;for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}gain/=period;loss/=period;for(let i=period+1;i<closes.length;i++){const d=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period;}return gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);}
export function atrWilder(bars:Candle[],period=14){if(bars.length<period+1)return null;const tr=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));let atr=tr.slice(0,period).reduce((a,b)=>a+b,0)/period;for(const v of tr.slice(period))atr=(atr*(period-1)+v)/period;return atr;}
const day=(ts:number,tz:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts*1000));
export function technicalSnapshot(dailyInput:any[],intradayInput:any[],meta:any,now=Date.now()){
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
 return {asOf:new Date(now).toISOString(),price,currency:meta.currency,quoteTime,quoteAgeSeconds,sessionDate,sessionOpen,sessionStart:regular?.start||null,sessionEnd:regular?.end||null,timeZone:tz,lastBarTime:lastBar?.time||null,dailyThrough:last?.time||null,dailySessions:daily.length,intradayBars:intraday.length,rsi14:round(rsi),atr14:round(atr),sma20:round(sma20),sma50:round(sma50),sma200:round(sma200),vwap:round(vwap),levels:levels?Object.fromEntries(Object.entries(levels).map(([k,v])=>[k,round(v)])):null,trend:sma20!==null&&sma50!==null?(sma20>sma50?'rising':sma20<sma50?'falling':'flat'):'unknown',fresh,sufficient,largeGap:gap!==null&&gap>3,reasons,sourceUrl:'https://finance.yahoo.com/quote/'+encodeURIComponent(meta.symbol||'')+'/chart/',method:'Wilder RSI/ATR(14); SMA(20/50/200); volume-weighted typical price from completed regular-session 5m bars; prior-session pivots and 20-session extremes. Prices may be delayed.'};
}
export function pricePlan(technical:any,{side,authorized=false,locked=false,manualExit=false}:any){
 const t=technical,price=t.price,atr=t.atr14,l=t.levels;
 const base={side,authorized,manualExit,orderType:'LIMIT',limit:null as number|null,zone:null as number[]|null,invalidation:null as number|null,target1:null as number|null,target2:null as number|null,rewardRisk:null as number|null,canDraft:false,status:'Unavailable',reasons:[...t.reasons],validUntil:t.quoteTime?new Date(Math.min(Date.now()+60000,t.quoteTime*1000+20*60000)).toISOString():null};
 if(locked)return {...base,status:'Locked — non-discretionary holding',reasons:['ORCL ESPP is excluded from buy, trim and exit proposals.']};
 if(!price||!atr||!l||!t.sufficient)return base;
 if(side==='buy'){
 const supports=[l.pivot,l.s1,l.s2,l.low20,l.sessionLow,t.vwap,t.sma20].filter((v:any)=>finite(v)&&v>0&&v<=price);
 if(!supports.length)return {...base,status:'Wait — no nearby support'};
 const support=Math.max(...supports),limit=Math.min(price,support+.05*atr),stop=Math.max(.01,support-.8*atr);
 const resistances=[l.r1,l.r2,l.high20,l.sessionHigh,t.sma50,t.sma200].filter((v:any)=>finite(v)&&v>limit);
 const target1=resistances.length?Math.min(...resistances):limit+2*atr,target2=Math.max(target1,limit+2*atr),ratio=(target1-limit)/(limit-stop);
 const trendOK=t.trend!=='falling'&&t.rsi14!==null&&t.rsi14<70;
 const near=price-limit<=2*atr;
 const actionable=authorized&&trendOK&&ratio>=1.5&&near&&t.sessionOpen&&t.fresh&&!t.largeGap;
 const blockers=[!authorized?'Required purchase checks have not passed.':null,!trendOK?'Trend or momentum confirmation is missing.':null,ratio<1.5?`Reward/risk is ${round(ratio)}; at least 1.5 is required.`:null,!near?'The price needs to pull back toward the entry zone.':null,t.largeGap?'An abnormal price gap needs review.':null,!t.sessionOpen?'The market is closed; refresh during the next regular session.':!t.fresh?'The quote or intraday candles need refreshing.':null].filter(Boolean) as string[];
 return {...base,blockers,limit:round(limit),zone:[round(support-.1*atr)!,round(Math.min(price,support+.15*atr))!],invalidation:round(stop),target1:round(target1),target2:round(target2),rewardRisk:round(ratio),canDraft:actionable,status:!authorized?'Buying paused — required checks have not passed':!t.sessionOpen?'Next-session preview':!t.fresh?'Refresh stale data':!trendOK?'Wait — trend/momentum confirmation needed':ratio<1.5?'Wait — reward/risk below 1.5':!near?'Wait for a pullback toward the entry zone':t.largeGap?'Review abnormal gap':'Limit-buy draft available',reasons:[...base.reasons,`Entry is tied to nearby support (${round(support)}) with a daily-ATR buffer.`, `RSI ${t.rsi14}; ${t.trend} SMA20/50 trend; reward/risk to the nearest resistance is ${round(ratio)}.`,...(!authorized?['A technical setup does not upgrade a watchlist/rejected stock into an approved purchase.']:[])]};
 }
 if(side==='sell'){
 const support=[l.s1,l.low20,l.sessionLow,t.vwap].filter((v:any)=>finite(v)&&v>0&&v<price);
 return {...base,limit:round(price),zone:[round(Math.max(.01,price-.1*atr))!,round(price+.25*atr)!],invalidation:support.length?round(Math.max(...support)-.25*atr):round(price-atr),canDraft:authorized&&t.sessionOpen&&t.fresh&&!t.largeGap,status:!authorized?'Review only — no verified sell decision':!t.sessionOpen?'Next-session preview':!t.fresh?'Refresh stale data':t.largeGap?'Review abnormal gap':manualExit?'Your full-exit scenario':'Concentration-trim limit draft',reasons:[...base.reasons,manualExit?'This full-exit scenario is your choice, not an AI exit recommendation.':'Risk reduction takes priority over waiting for a rally. The limit reference is the latest quote, not an assumed future price.','The downside level is an alert/invalidation reference, not a stop order.']};
 }
 return {...base,status:'Hold / review — no trade proposed'};
}

import {MonitorError,safeError} from './market-support.mjs';
export async function technicalForStock(ticker,{snapshot,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),signal,now=Date.now,log=()=>{}}){
 async function chart(interval,range){
  for(let attempt=1;attempt<=2;attempt++){
   try{
    const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?'+new URLSearchParams({interval,range,includePrePost:'false'});
    const r=await fetcher(url,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});
    if(!r.ok){const rawRetry=r.headers.get('Retry-After'),retryAfter=Number.isFinite(Number(rawRetry))?Number(rawRetry)*1000:Math.max(0,Date.parse(rawRetry)-now());const e=new MonitorError('Price provider HTTP '+r.status,{operation:'technical',status:r.status,code:'PRICE_HTTP_'+r.status,retryable:[429,500,502,503,504].includes(r.status)});e.retryAfterMs=Number.isFinite(retryAfter)?retryAfter:0;throw e;}
    const data=await r.json(),result=data.chart?.result?.[0];if(!result)throw new MonitorError('Price provider returned no candle data',{operation:'technical',code:'PRICE_DATA_MISSING'});
    const q=result.indicators?.quote?.[0]||{};return {meta:result.meta,bars:(result.timestamp||[]).map((time,i)=>({time,open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:q.volume?.[i]}))};
   }catch(error){log({event:'stock_fetch_error',ticker,interval,range,attempt,code:error.code||error.name,error:safeError(error)});if(attempt===2||error.retryable===false||signal?.aborted||error.retryAfterMs>10000)throw error;await sleep(Math.max(500,error.retryAfterMs||0));}
  }
 }
 const [daily,intraday,quote]=await Promise.all([chart('1d','1y'),chart('5m','5d'),chart('1d','1d')]);
 return snapshot(daily.bars,intraday.bars,quote.meta,now());
}
export async function computeReview(frame,{technicals={},onProgress=async()=>{},load,calculate,now=Date.now,check=()=>{},log=()=>{},concurrency=4}={}){
 const stocks=[...new Set(frame.targets.map(t=>t.ticker))];let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,stocks.length)},async()=>{while(next<stocks.length){const ticker=stocks[next++];check();if(technicals[ticker])continue;
  if(Date.parse(frame.expiresAt)-now()<30000){technicals[ticker]={error:'Review time budget ended; current technical data is unavailable.',code:'REVIEW_BUDGET'};continue;}
  try{technicals[ticker]={value:await load(ticker),collectedAt:new Date(now()).toISOString()};}
  catch(e){technicals[ticker]={error:safeError(e),code:e.code||e.name||'TECHNICAL_UNAVAILABLE'};log({event:'stock_unavailable',ticker,code:technicals[ticker].code,error:technicals[ticker].error});}
  await onProgress(technicals);check();
 }}));
 const plans=[];
 for(const target of frame.targets){check();const item=technicals[target.ticker];if(!item?.value){plans.push({...target,error:item?.error||'Technical data unavailable',code:item?.code||'TECHNICAL_UNAVAILABLE'});continue;}
  const d=calculate(frame,item.value,{...target,intent:'recommended'});if(d.httpStatus){plans.push({...target,error:d.error,code:'PLAN_'+d.httpStatus});continue;}
  plans.push({...target,plan:d.plan,technical:{currency:d.technical.currency,quoteTime:d.technical.quoteTime,sessionOpen:d.technical.sessionOpen,price:d.technical.price},checkedAt:new Date(now()).toISOString()});
 }
 return {plans,stocks:stocks.length,unavailable:plans.filter(p=>p.error).length};
}

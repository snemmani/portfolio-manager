import {withDataBudget} from './data-budget';
import {dataTimeout} from './data-budget';
import {executionFromContext} from './execution-engine';
import {ValueCache} from './request-cache';
import {rulesMode,liveMarket} from './market-store';
import { technicalSnapshot } from './technicals';
import { dashboard } from './data';
import { discoveryHandler } from './ai';
const candleCache=new ValueCache();
function candles(ticker:string,interval:string,range:string){return candleCache.get(ticker+interval+range,900000,()=>chart(ticker,interval,range));}
const cache=new ValueCache();
async function chart(ticker:string,interval:string,range:string){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(dataTimeout(8000))});if(!r.ok)throw Error('Market candles unavailable');const d:any=await r.json();const result=d.chart?.result?.[0];if(!result)throw Error('No candle data');const q=result.indicators?.quote?.[0]||{};return {meta:result.meta,bars:(result.timestamp||[]).map((time:number,i:number)=>({time,open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:q.volume?.[i]}))};}
/** Market index used for relative strength: Nifty 50 for Indian listings, S&P 500 otherwise. */
export const benchmarkFor=(ticker:string)=>/\.(NS|BO)$/.test(ticker)?'^NSEI':'^GSPC';
export function technicalData(ticker:string){return cache.get(ticker,60000,()=>Promise.all([candles(ticker,'1d','1y'),candles(ticker,'5m','5d'),chart(ticker,'1d','1d'),candles(benchmarkFor(ticker),'1d','1y').catch(()=>null)]).then(([daily,intraday,current,index])=>technicalSnapshot(daily.bars,intraday.bars,current.meta,Date.now(),index?.bars||null)));}
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function loadExecutionContext(env:any,snapshot?:any):Promise<any>{
 const snap=snapshot||await dashboard(env);
 const report:any=await env.DB.prepare("SELECT as_of,recommendations_json,new_stock_ideas_json,discovery_json FROM reports WHERE id='latest' AND provider IN ('antigravity','codex-subscription')").first();
 const rulesBased=rulesMode(env);
 const live=rulesBased?await liveMarket(env,snap.portfolios,report?.discovery_json?JSON.parse(report.discovery_json):null,snap):await(await discoveryHandler(new Request('http://localhost/api/discovery'),env)).json();
 return {snap,report,live,rulesBased};
}
export async function executionHandler(request:Request,env:any){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const url=new URL(request.url),ticker=(url.searchParams.get('ticker')||'').toUpperCase(),portfolio=url.searchParams.get('portfolio')||'',intent=url.searchParams.get('intent')||'recommended';
 if(!/^[A-Z0-9.&-]{1,25}(\.NS|\.BO)?$/.test(ticker)||!['recommended','profit','exit'].includes(intent))return json({error:'Invalid price-plan request'},400);
 const context=await loadExecutionContext(env);
 if(!context.snap.holdings.some((h:any)=>h.ticker===ticker&&h.portfolio===portfolio)&&!context.live?.discovery?.candidates?.some((c:any)=>c.ticker===ticker))return json({error:'Select a current holding or a screened candidate.'},404);
 const data=executionFromContext(context,await technicalData(ticker),{ticker,portfolio,intent,budget:url.searchParams.get('budget')});
 return json(data,data.httpStatus||200);
}

/** One bounded, request-owned context for the alert scan; never shared pending I/O across requests. */
export function createExecutionSession(env:any,budgetMs=90000){
 const deadline=Date.now()+budgetMs;let context:Promise<any>|undefined;const stocks=new Map<string,Promise<any>>();
 const frame=()=>{if(Date.now()>=deadline)throw Error('Alert scan time budget exhausted');return context??=withDataBudget(Math.min(45000,deadline-Date.now()),()=>loadExecutionContext(env));};
 return {
  snapshot:async()=>(await frame()).snap,
  discovery:async()=>{const c=await frame();return {...c.live,holdingRecommendations:JSON.parse(c.report?.recommendations_json||'[]'),reportAsOf:c.report?.as_of||null};},
  response:async(options:any)=>{try{const c=await frame();if(Date.now()>=deadline)throw Error('Alert scan time budget exhausted');let stock=stocks.get(options.ticker);if(!stock){stock=withDataBudget(Math.min(10000,deadline-Date.now()),()=>technicalData(options.ticker));stocks.set(options.ticker,stock);}const d=executionFromContext(c,await stock,options);return json(d,d.httpStatus||200);}catch{return json({error:'Current scan could not finish this price plan; retry on the next pass.'},503);}}
 };
}

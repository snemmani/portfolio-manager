import { technicalSnapshot,pricePlan } from './technicals';
import { dashboard } from './data';
import { discoveryHandler } from './ai';
import { planDiscovery } from './discovery';
const cache=new Map<string,{until:number;value:Promise<any>}>();
async function chart(ticker:string,interval:string,range:string){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Market candles unavailable');const d:any=await r.json();const result=d.chart?.result?.[0];if(!result)throw Error('No candle data');const q=result.indicators?.quote?.[0]||{};return {meta:result.meta,bars:(result.timestamp||[]).map((time:number,i:number)=>({time,open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:q.volume?.[i]}))};}
export function technicalData(ticker:string){const hit=cache.get(ticker);if(hit&&hit.until>Date.now())return hit.value;const value=Promise.all([chart(ticker,'1d','1y'),chart(ticker,'5m','5d')]).then(([daily,intraday])=>technicalSnapshot(daily.bars,intraday.bars,intraday.meta)).catch(e=>{cache.delete(ticker);throw e});cache.set(ticker,{until:Date.now()+60000,value});return value;}
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function executionHandler(request:Request,env:any){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const url=new URL(request.url),ticker=(url.searchParams.get('ticker')||'').toUpperCase(),portfolio=url.searchParams.get('portfolio')||'',intent=url.searchParams.get('intent')||'recommended';
 if(!/^[A-Z0-9.&-]{1,25}(\.NS|\.BO)?$/.test(ticker)||!['recommended','exit'].includes(intent))return json({error:'Invalid price-plan request'},400);
 const snap=await dashboard(env);let h=snap.holdings.find((h:any)=>h.ticker===ticker&&h.portfolio===portfolio);const p=snap.portfolios.find((p:any)=>p.name===portfolio);
 const report:any=await env.DB.prepare("SELECT as_of,recommendations_json,new_stock_ideas_json,discovery_json FROM reports WHERE id='latest' AND provider='codex-subscription'").first();
 const discovery=report?.discovery_json?JSON.parse(report.discovery_json):null,c=discovery?.candidates?.find((c:any)=>c.ticker===ticker);
 if(!h&&!c)return json({error:'Select a current holding or a screened candidate.'},404);
 if(intent==='exit'&&!h)return json({error:'An exit scenario requires an existing holding in the selected portfolio.'},400);
 const technical=await technicalData(ticker);const expected=h?.currency||c?.currency;
 if(technical.currency!==expected)return json({error:'Market currency mismatch; no order draft.'},502);
 const recs=JSON.parse(report?.recommendations_json||'[]'),ideas=JSON.parse(report?.new_stock_ideas_json||'[]'),idea=ideas.find((i:any)=>i.portfolio===portfolio&&i.ticker===ticker);
 const researchFresh=report?.as_of&&Date.now()-Date.parse(report.as_of)<=6*3600000;
 let side='none',authorized=false,quantity:number|null=null,reason='No verified trade action for this position.';
 if(h){
 if(intent==='exit'){side='sell';authorized=!h.invalid&&!h.nonDiscretionary;quantity=h.shares;reason='Full-exit scenario explicitly selected by you.';}
 else if(h.action==='Trim'){side='sell';authorized=!h.invalid&&p?.complete;const rate=h.fx;const currentValue=rate&&technical.price?h.shares*technical.price*rate:null;const total=currentValue!==null?p.value+(currentValue-(h.value||0)):null;const excess=total!==null&&currentValue!==null?Math.max(0,currentValue-total*.15):0;const unit=technical.price&&rate?technical.price*rate:null;const raw=unit?excess/unit:0;quantity=Math.min(h.shares,h.currency==='INR'?Math.ceil(raw):Math.ceil(raw*10000)/10000);reason='Verified concentration trim toward the 15% position cap.';}
 else if(h.action==='Add candidate'){side='buy';authorized=!!researchFresh&&recs.some((r:any)=>r.portfolio===portfolio&&r.ticker===ticker&&['buy','add'].includes(r.action));reason=authorized?'Existing holding passes the purchase screen and Codex selection.':'Purchase screen is conditional; Codex has not approved an add.';}
 }else if(c){side=c.status==='rejected'?'none':'buy';authorized=!!researchFresh&&c.status==='eligible'&&idea?.decision==='enter'&&!!p?.complete;reason=authorized?'Screen and Codex selection support a conditional new entry.':'Watch/review candidate: technical levels are conditional only.';}
 const plan=pricePlan(technical,{side,authorized,locked:h?.nonDiscretionary,manualExit:intent==='exit'});
 if(side==='buy'&&authorized&&p){
 const response=await discoveryHandler(new Request(url.origin+'/api/discovery'),env);const live:any=await response.json();
 const available=Math.max(0,Math.min(Number(url.searchParams.get('budget')||p.cash),p.cash));
 if(!Number.isFinite(available))return json({error:'Invalid budget'},400);
 if(plan.limit!==null){
 const liveDiscovery=live.discovery||{asOf:snap.asOf,candidates:[],fx:snap.fx};liveDiscovery.combinedTotal=snap.totals.value;
 // Sizing uses the same exposure/budget engine, substituting only this limit.
 liveDiscovery.candidates=(liveDiscovery.candidates||[]).map((x:any)=>x.ticker===ticker?{...x,price:plan.limit}:x);
 const adjustedHoldings=snap.holdings.map((x:any)=>x.ticker===ticker&&x.portfolio===portfolio?{...x,price:plan.limit}:x);
 const sized=planDiscovery(p,adjustedHoldings,available,h?.currency==='USD'||c?.currency==='USD'?'US':'India',liveDiscovery,live.ideas||[]);quantity=sized.allocations.find((x:any)=>x.ticker===ticker)?.quantity||0;
 }
 }
 if(!quantity||quantity<=0){plan.canDraft=false;if(side==='sell'&&intent!=='exit'&&authorized){plan.status='Position now within cap — no trim quantity';plan.reasons.push('The refreshed price no longer yields a positive concentration-trim quantity.');}}
 if(h?.invalid){plan.canDraft=false;plan.reasons.push('Reconcile the ledger/corporate action before sizing a trade.');}
 if(!researchFresh&&side==='buy'){plan.canDraft=false;plan.reasons.push('Research must be refreshed before a buy draft.');}
 return json({ticker,portfolio:portfolio||null,intent,technical,plan:{...plan,quantity,decisionReason:reason},researchAsOf:report?.as_of||null,refreshSeconds:60,limitations:['Quotes and 5-minute bars may be delayed. Confirm the broker quote, tick size, spread and session before submitting.','Levels are rule-based reference prices, not predictions. A limit order may not fill; a stop reference is not a guaranteed execution price.'],sources:[{title:'Yahoo Finance price history',url:technical.sourceUrl},{title:'RSI methodology',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI'},{title:'ATR methodology',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr'}]});
}

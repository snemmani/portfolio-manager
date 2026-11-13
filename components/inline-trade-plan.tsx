'use client';
import SaleImpact from './sale-impact';
import {useEffect,useState} from 'react';
import {formatIST} from '../lib/time';
import {tradeSummary} from '../lib/trade-summary';
const cache=new Map<string,{until:number;promise:Promise<any>}>();let active=0;const queue:(()=>void)[]=[];
function limited<T>(fn:()=>Promise<T>):Promise<T>{return new Promise((resolve,reject)=>{const run=()=>{active++;fn().then(resolve,reject).finally(()=>{active--;queue.shift()?.()})};if(active<3)run();else queue.push(run)})}
function load(key:string){const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.promise;const promise=limited(async()=>{const r=await fetch('/api/execution?'+key,{signal:AbortSignal.timeout(30000)});const d:any=await r.json();if(!r.ok)throw Error(d.error||'Price plan unavailable');return d}).catch(e=>{cache.delete(key);throw e});cache.set(key,{until:Date.now()+60000,promise});return promise;}
const money=(value:number,currency:string)=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(value);
export default function InlineTradePlan({ticker,portfolio,action,budget,revision,referencePrice,currency,reason,pending=false,buyReview=false}:{ticker:string;portfolio?:string;action:string;budget?:string;revision?:string;referencePrice?:number;currency?:string;reason?:string;pending?:boolean;buyReview?:boolean}){
 const a=action.toLowerCase(),side=['trim','sell','exit','profit review','trim review','exit review'].includes(a)?'sell':['buy','add','add candidate','enter'].includes(a)?'buy':null;
 const allowed=!!side&&!!portfolio;
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 const query=new URLSearchParams({ticker,portfolio:portfolio||'',intent:a==='profit review'?'profit':'recommended'});if(budget!==undefined&&budget!=='')query.set('budget',budget);const key=query.toString();
 useEffect(()=>{setData(null);setError('');if(!allowed)return;let mounted=true;const refresh=()=>load(key).then(d=>{if(mounted){setData(d);setError('')}}).catch(()=>{if(mounted){setData(null);setError('Market data is unavailable. Quantity and price cannot be confirmed.')}});refresh();const timer=setInterval(refresh,60000);return()=>{mounted=false;clearInterval(timer)}},[key,allowed,revision]);
 useEffect(()=>{if(!allowed)return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer)},[allowed]);
 const summary=side?tradeSummary(data,side,now):null;
 const chip=(ok?:boolean)=>'inline-flex h-5 items-center justify-self-start rounded-sm border px-1.5 text-[11px] font-semibold '+(ok?'border-gain/30 bg-gain-soft text-gain':'border-warn/30 bg-warn-soft text-warn');
 return <div className="grid gap-1.5 rounded-md border border-line bg-raised px-3 py-2.5 text-xs leading-relaxed" aria-live="polite"><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Shares & price</h3>
  {!allowed?<><strong className="font-mono text-sm">{pending?'Buy decision pending':buyReview?'No purchase approved':'No quantity or order price set'}</strong><p className="text-muted-foreground">{reason||(!portfolio?'Choose a portfolio for the quantity and price.':'No share quantity or order price is set for this assessment.')}</p>{referencePrice&&currency&&<small className="font-mono text-[11px] text-muted-foreground">Quote {money(referencePrice,currency)} · not an order price</small>}</>
  :error?<p className="text-loss">{error}</p>
  :!data?<p className="text-muted-foreground">Loading quantity and recommended price…</p>
  :summary?.show?<><span className={chip(summary.ready)}>{summary.label}</span><strong className="font-mono text-sm">{!summary.ready&&side==='buy'?'No buy order suggested':`${summary.ready?'':'Preview: '}${side==='buy'?'Buy':'Sell'} ${summary.quantity.toLocaleString('en-IN',{maximumFractionDigits:4})} shares`}</strong>{!summary.ready&&side==='buy'&&<p className="text-muted-foreground">Potential size if all checks pass: {summary.quantity.toLocaleString('en-IN',{maximumFractionDigits:4})} shares.</p>}<div className="text-muted-foreground">{summary.ready?'Recommended limit':'Illustrative limit'} <b className="ml-1 font-mono text-sm text-foreground">{money(summary.limit,summary.currency)}</b></div><small className="font-mono text-[11px] text-muted-foreground">Quote {formatIST(summary.quoteTime,true)}</small><p>{summary.message}</p></>
  :<><strong className="font-mono text-sm">No {side==='buy'?'purchase':'sale'} approved</strong><p className="text-muted-foreground">{summary?.message}</p></>}
  {data?.saleAssessment&&portfolio&&<SaleImpact assessment={data.saleAssessment} ticker={ticker} portfolio={portfolio} onReviewed={()=>{cache.delete(key);load(key).then(setData).catch(()=>setError('Refresh the price plan.'))}}/>}
 </div>;
}

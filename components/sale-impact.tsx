'use client';
import {formatIST} from '../lib/time';
import {useState} from 'react';
const money=(n:number,c:string)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:c,maximumFractionDigits:2}).format(n);
export default function SaleImpact({assessment,ticker,portfolio,onReviewed}:{assessment:any;ticker:string;portfolio:string;onReviewed?:()=>void}){
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);if(!assessment||assessment.kind==='none')return null;
 const a=assessment,i=a.impact;
 async function review(){setBusy(true);try{const r=await fetch('/api/trades',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'review_profit',ticker,portfolio,fingerprint:a.reviewToken,confirmed:true})});const d:any=await r.json();setNotice(d.message||d.error);if(r.ok){onReviewed?.();window.dispatchEvent(new Event('arthapalana-trade-change'))};}catch{setNotice('Review could not be saved.')}finally{setBusy(false)}}
 return <div className="grid gap-1.5 border-t border-line pt-3 text-xs leading-relaxed">
  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{a.illustrative?'Sale review · no order proposed':'Before selling'}</h3>
  {i?<>
   <p>{a.illustrative?'Illustration: ':''}Sell <span className="font-mono">{i.quantity.toLocaleString('en-IN',{maximumFractionDigits:4})}</span> shares at <span className="font-mono">{money(i.price,i.currency)}</span>.</p>
   <strong className={'font-mono text-sm '+(i.grossPnl<0?'text-loss':'text-gain')}>FIFO {i.grossPnl<0?'loss':'profit'} {money(Math.abs(i.grossPnl),i.currency)}{i.pnlPct!==null?` (${Math.abs(i.pnlPct).toFixed(1)}%)`:''}</strong>
   <p className="text-muted-foreground">Proceeds <span className="font-mono">{money(i.proceeds,i.currency)}</span> · cost <span className="font-mono">{money(i.cost,i.currency)}</span> · keep <span className="font-mono">{i.remainingShares.toLocaleString('en-IN',{maximumFractionDigits:4})}</span> shares{i.remainingWeight!==null?` · ${i.remainingWeight.toFixed(2)}% of the portfolio`:''}</p>
   <small className="font-mono text-[10px] text-muted-foreground">{i.limitations}</small>
  </>:<p className="text-muted-foreground">A reliable sale estimate needs a valid FIFO cost basis and enough shares. No gain or loss is assumed.</p>}
  <h4 className="mt-1 text-xs font-semibold">{a.justified?'Why this sale is supported':'Why a sale still needs review'}</h4>
  {a.reasons.map((r:string,n:number)=><p key={n}>{r}</p>)}
  {a.checks.length>0&&<details className="text-muted-foreground"><summary className="cursor-pointer font-medium">Before deciding</summary><div className="mt-1 grid gap-1">{a.checks.map((r:string,n:number)=><p key={n}>{r}</p>)}{a.thesisNotes.map((n:any,k:number)=><p key={k}>Your note ({n.date}): {n.note}</p>)}<p>{a.outlook}</p>{a.financialEvidence&&<p>Annual evidence ({a.financialEvidence.date}): revenue growth {a.financialEvidence.revenueGrowth?.toFixed(1)??'unknown'}%; earnings growth {a.financialEvidence.earningsGrowth?.toFixed(1)??'unknown'}%; operating cash flow / profit {a.financialEvidence.cashConversion?.toFixed(2)??'unknown'}. Historical growth does not establish the forward outlook.</p>}{a.researchContext?.review&&<><h4 className="mt-1 font-semibold text-foreground">AI commentary · {formatIST(a.researchContext.asOf)}{a.researchContext.fresh?'':' · older review'}</h4>{a.researchContext.review.reasons.map((r:string,n:number)=><p key={n}>{r}</p>)}{a.researchContext.review.risks.map((r:string,n:number)=><p key={'risk'+n}>{r}</p>)}</>}</div></details>}
  {a.kind==='profit'&&a.reviewable&&!a.justified&&<button className="mt-1 inline-flex h-8 items-center justify-self-start rounded-md border border-line px-3 text-xs font-medium hover:bg-hover disabled:opacity-50" disabled={busy} onClick={review}>I've reviewed the outlook — approve this partial-sale assessment</button>}
  {notice&&<p role="status" className="text-brand">{notice}</p>}
 </div>;
}

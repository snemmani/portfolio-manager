'use client';
import {investmentExplanation} from '../lib/investment-explanation';
export default function InvestmentDecision({discovery,ticker,price,period,portfolioReason}:{discovery:any;ticker:string;price?:number;period?:string;portfolioReason?:string}){
 const d=investmentExplanation(discovery,ticker,price,period);
 return <section className="grid gap-2 text-xs leading-relaxed">
  <h4 className="text-[13px] font-semibold">{d.title}</h4><p>{d.summary}</p>
  {d.blockers.length>0&&!d.clear&&<ul className="grid gap-1">{d.blockers.map(b=><li key={b.title} className="border-l-2 border-loss/60 pl-2 font-medium">{b.title}</li>)}</ul>}
  {d.clear&&d.drivers.length>0&&<div><h5 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Why consider it</h5><ul className="grid list-disc gap-0.5 pl-4">{d.drivers.map((s:string)=><li key={s}>{s}</li>)}</ul></div>}
  {d.warnings.length>0&&<div className="rounded-md border border-warn/40 bg-warn-soft p-2"><h5 className="mb-1 font-semibold text-warn">{d.clear?`Warnings · ${d.positionCapPct}% position cap`:'Other warnings'}</h5><ul className="grid list-disc gap-0.5 pl-4">{d.warnings.map(s=><li key={s}>{s}</li>)}</ul></div>}
  {d.clear&&portfolioReason&&<p><strong>Before buying:</strong> {portfolioReason}</p>}
  <details><summary className="cursor-pointer font-medium text-muted-foreground">Checks & supporting evidence</summary><div className="mt-2 grid gap-2"><dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line [&>div]:bg-panel [&>div]:px-2 [&>div]:py-1.5">{d.checks.map(c=><div key={c.key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{c.label}</dt><dd className="text-right font-medium">{c.status}</dd></div>)}</dl>{d.review?.summary&&<p>{d.review.summary}</p>}{d.details.length>0&&<div><h5 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Unresolved details</h5><ul className="grid list-disc gap-0.5 pl-4">{d.details.map(s=><li key={s}>{s}</li>)}</ul></div>}{d.allWarnings.length>0&&<div><h5 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">All warnings</h5><ul className="grid list-disc gap-0.5 pl-4">{d.allWarnings.map(s=><li key={s}>{s}</li>)}</ul></div>}</div></details>
 </section>;
}

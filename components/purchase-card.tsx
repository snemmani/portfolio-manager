'use client';
import ReturnPotential from './return-potential';
import {hasUsableBuyCeiling} from '../lib/buy-ceiling';
import {fundamentalCheck} from '../lib/fundamental-policy';
import InlineTradePlan from './inline-trade-plan';
import {purchaseRationale} from '../lib/purchase-rationale';
import {formatIST} from '../lib/time';
const money=(v:number|null|undefined,currency='INR')=>typeof v!=='number'||!Number.isFinite(v)?'Unavailable':new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(v);
export default function PurchaseCard({allocation:a,portfolio,holdings,discovery,budget,revision}:{allocation:any;portfolio:any;holdings:any[];discovery:any;budget:string;revision?:string}){
 const why=purchaseRationale(a,portfolio,holdings,discovery),investment=fundamentalCheck(discovery,a.ticker,a.price);const review=investment.review;
 return <article className="grid gap-2 rounded-md border border-line bg-panel p-3 text-xs leading-relaxed">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><strong className="font-mono text-sm">{a.ticker.replace(/\.(NS|BO)$/,'')}</strong><span className="inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-semibold border-gain/30 bg-gain-soft text-gain">{a.isNew?'NEW ENTRY':'ADD'}</span></span><strong className="font-mono text-sm">{money(a.amount)} reserved</strong></div>
  <p className="text-muted-foreground">Budget estimate <span className="font-mono text-foreground">{a.quantity.toLocaleString('en-IN',{maximumFractionDigits:4})}</span> shares at <span className="font-mono text-foreground">{money(a.price,a.currency)}</span> · Yahoo quote {formatIST(a.quoteTime,true)}, not a confirmed close or an entry recommendation.</p>
  <InlineTradePlan ticker={a.ticker} portfolio={portfolio.name} action={a.isNew?'buy':'add'} budget={budget} revision={revision} referencePrice={a.price} currency={a.currency}/>
  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mt-1">Investment case</h3><p>{investment.clear&&review?review.thesis:investment.reason}</p>
  <ReturnPotential value={investment.returnPotential} currency={a.currency}/>
  {review&&<dl className="grid gap-1"><div><dt className="inline font-semibold">Main driver: </dt><dd className="inline">{review.catalysts?.[0]}</dd></div><div><dt className="inline font-semibold">Main risk: </dt><dd className="inline">{review.risks?.[0]}</dd></div><div><dt className="inline font-semibold">Enforced buy ceiling: </dt><dd className="inline font-mono">{money(hasUsableBuyCeiling(investment)?investment.valuation?.ceiling:null,review.valuation.currency)}</dd><span className="text-muted-foreground"> · review {formatIST(review.researchedAt)}</span></div></dl>}
  {a.researchWarnings?.length>0&&<div className="rounded-md border border-warn/40 bg-warn-soft p-2"><h3 className="mb-1 text-xs font-semibold text-warn">Warnings · {a.researchPositionCapPct}% position cap</h3><ul className="grid list-disc gap-0.5 pl-4">{a.researchWarnings.slice(0,3).map((s:string)=><li key={s}>{s}</li>)}</ul></div>}
  <details><summary className="cursor-pointer font-medium text-muted-foreground">Financial evidence, events & portfolio fit</summary><div className="mt-2 grid gap-2"><div><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Financial evidence</h3><p>{why.heading}{why.period?` · annual figures to ${new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(why.period))}`:''}.</p><ul className="grid list-disc gap-0.5 pl-4">{why.evidence.map((line:string)=><li key={line}>{line}</li>)}</ul></div><div><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Why it fits {portfolio.name}</h3><p>{why.sizing}</p></div><div><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">News & company events</h3><p>{why.event.reason} {why.event.checkedAt&&`Checked ${formatIST(why.event.checkedAt,true)}.`}</p></div></div></details>
  <p className="text-[11px] text-muted-foreground">{review?'The investment case rests on cited company research, not an independent audit. Recheck it if results or material events change.':why.caution}</p>
  <a className="justify-self-start text-brand hover:underline" href={why.sourceUrl} target="_blank" rel="noreferrer">Financial source ↗</a>
 </article>;
}

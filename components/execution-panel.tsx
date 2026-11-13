'use client';
import ReturnPotential from './return-potential';

import SaleImpact from './sale-impact';
import { formatIST } from '../lib/time';
import { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Copy, Clock, ExternalLink, AlertTriangle, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils';
import { symbol } from './terminal/format';

const money = (n: any, c = 'INR') => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n));
const date = (value: any) => formatIST(value, true);
const H = 'mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
const chip = (ok: boolean) => cn('inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-semibold', ok ? 'border-gain/30 bg-gain-soft text-gain' : 'border-warn/30 bg-warn-soft text-warn');

/** Technical price plan: limit, size, zone and invalidation from daily and 5-minute candles. Nothing is sent to a broker. */
export default function ExecutionPanel({ target, onClose }: { target: { ticker: string; portfolio?: string; budget?: string; allowExit?: boolean; intent?: 'profit' }; onClose: () => void }) {
  const [intent, setIntent] = useState(target.intent||'recommended');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const query = new URLSearchParams({ ticker: target.ticker, portfolio: target.portfolio || '', intent });
        if (target.budget) query.set('budget', target.budget);
        const r = await fetch('/api/execution?' + query, { signal });
        const d: any = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || 'Price plan unavailable');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [target.ticker, target.portfolio, target.budget, intent],
  );
  useEffect(() => {
    setData(null);
    setNotice('');
    const abort = new AbortController();
    load(abort.signal);
    const timer = setInterval(() => load(abort.signal), 60000);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const t = data?.technical, p = data?.plan, currency = t?.currency || 'INR';
  const arm = async () => {
    try {
      const r = await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'arm', ...target, intent }) });
      const v: any = await r.json();
      setNotice(v.message || v.error);
    } catch {
      setNotice('Alert could not be armed.');
    }
  };
  const copy = async () => {
    if (!p?.canDraft || !p.validUntil || Date.now() > Date.parse(p.validUntil)) {
      setNotice('This draft has expired or is conditional. Refresh the data before copying.');
      return;
    }
    const text = [
      `${p.manualExit ? 'USER-CHOSEN EXIT SCENARIO' : 'REVIEW DRAFT'} — ${data.ticker}`,
      `Portfolio: ${data.portfolio}`,
      `${p.side.toUpperCase()} ${p.quantity} shares · LIMIT ${money(p.limit, currency)}`,
      `Quote: ${date(t.quoteTime)} · Valid until ${date(p.validUntil)}`,
      `Basis: ${p.decisionReason}`,
      'Confirm live broker quote, tick size, spread and available quantity before submission. No order has been placed.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Order draft copied. Review it against the broker quote before submission.');
    } catch {
      setNotice(text);
    }
  };

  const ticket: [string, string, boolean?][] = p
    ? [
        [p.side === 'buy' ? 'Buy limit' : p.side === 'sell' ? 'Sell limit' : 'Limit reference', money(p.limit, currency), true],
        ['Quantity', p.quantity === null ? 'Not sized' : p.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 }), true],
        [p.side === 'buy' ? 'Entry zone' : 'Sell zone', p.zone ? p.zone.map((v: number) => money(v, currency)).join(' – ') : '—'],
        ['Invalidation', money(p.invalidation, currency)],
        ...((p.side === 'buy'
          ? [
              ['Target 1 (resistance)', money(p.target1, currency)],
              ['Target 2 (extended)', money(p.target2, currency)],
              ['Reward / risk', p.rewardRisk === null ? '—' : p.rewardRisk.toFixed(2) + '×'],
            ]
          : []) as [string, string][]),
      ]
    : [];

  return (
    <div className="fixed inset-0 z-[70] font-sans text-foreground">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={`${target.ticker} technical price plan`} className="absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col border-l border-line bg-background shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line bg-panel px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Price plan</div>
            <h2 className="font-mono text-lg font-semibold">{symbol(target.ticker)}</h2>
            <p className="truncate text-xs text-muted-foreground">{target.portfolio || 'Choose a portfolio for sizing'} · daily trend + completed 5-minute candles</p>
          </div>
          <button onClick={onClose} aria-label="Close price plan" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <select
            aria-label="Price-plan scenario"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="recommended">Follow current trade rules</option>
            {target.intent==='profit'&&<option value="profit">Review profit-taking safeguards</option>}
            {target.allowExit && <option value="exit">My full-exit scenario (held positions only)</option>}
          </select>
          <button disabled={loading} onClick={() => load()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs hover:bg-hover disabled:opacity-50">
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <p role="alert" className="mb-3 flex gap-2 rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-loss">
              <AlertTriangle className="size-4 shrink-0" /> {error}
            </p>
          )}
          {loading && !data && (
            <div className="grid place-items-center py-16 text-xs text-muted-foreground">
              <RefreshCw className="mb-2 size-5 animate-spin text-brand" /> Fetching daily and intraday candles…
            </div>
          )}
          {data && (
            <div className="grid gap-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={chip(p.canDraft)}>{p.status}</span>
                <span className={chip(t.sessionOpen)}>{t.sessionOpen ? 'SESSION OPEN' : 'SESSION CLOSED'}</span>
                <span className="ml-auto text-right">
                  <span className="block font-mono text-lg font-semibold tabular-nums">{money(t.price, currency)}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    quote {date(t.quoteTime)} · bar {date(t.lastBarTime ? t.lastBarTime + 300 : null)}
                  </span>
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{p.decisionReason}</p>

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line [&>div]:bg-panel [&>div]:px-3 [&>div]:py-2">
                {ticket.map(([k, v, strong]) => (
                  <div key={k}>
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</dt>
                    <dd className={cn('font-mono tabular-nums', strong ? 'text-base font-semibold' : 'text-sm')}>{v}</dd>
                  </div>
                ))}
              </dl>

              {p.canDraft ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90">
                    <Copy className="size-3.5" /> Copy limit-order draft
                  </button>
                  <button onClick={arm} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs hover:bg-hover">
                    <BellRing className="size-3.5" /> Discord alert at this price
                  </button>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                    <Clock className="size-3" /> expires {date(p.validUntil)}
                  </span>
                </div>
              ) : (
                <p className="flex gap-2 rounded-md border border-line bg-raised px-3 py-2 text-xs text-muted-foreground">
                  <Clock className="size-4 shrink-0" />
                  {t.sessionOpen ? 'No order draft until eligibility, trend, data freshness and sizing checks pass.' : 'Closed-market preview: refresh during the next regular session before placing an order.'}
                </p>
              )}
              {notice && (
                <p role="status" className="rounded-md border border-brand/40 bg-brand-soft px-3 py-2 text-xs whitespace-pre-line">
                  {notice}
                </p>
              )}

              <SaleImpact assessment={data.saleAssessment} ticker={data.ticker} portfolio={data.portfolio} onReviewed={() => load()} />

              {p.blockers?.length > 0 && (
                <div className="rounded-md border border-warn/40 bg-warn-soft p-3 text-xs">
                  <strong className="text-warn">Why this purchase is not ready</strong>
                  <ul className="mt-1 grid list-disc gap-0.5 pl-4">
                    {p.blockers.map((reason: string) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {data.plan?.side==='buy'&&<ReturnPotential value={data.returnPotential} currency={data.technical?.currency}/>}
              <section>
                <h3 className={H}>Why these prices</h3>
                <ul className="grid gap-1.5 text-xs leading-relaxed">
                  {p.reasons.map((r: string, i: number) => (
                    <li key={i} className="border-l-2 border-brand/60 pl-3">
                      {r}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className={H}>Technical evidence</h3>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 [&>div]:bg-panel [&>div]:px-3 [&>div]:py-1.5">
                  {(
                    [
                      ['RSI 14', t.rsi14],
                      ['ATR 14', money(t.atr14, currency)],
                      ['SMA 20', money(t.sma20, currency)],
                      ['SMA 50', money(t.sma50, currency)],
                      ['SMA 200', money(t.sma200, currency)],
                      ['VWAP 5m', money(t.vwap, currency)],
                      ['20d support', money(t.levels?.low20, currency)],
                      ['20d resistance', money(t.levels?.high20, currency)],
                      ['Pivot S1', money(t.levels?.s1, currency)],
                      ['Pivot R1', money(t.levels?.r1, currency)],
                    ] as any[]
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
                      <dd className="font-mono text-xs tabular-nums">{value ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t.dailySessions} daily sessions · {t.intradayBars} five-minute bars for {t.sessionDate}. Daily data through{' '}
                  {t.dailyThrough ? new Date(t.dailyThrough * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'unavailable'}. {t.method}
                </p>
              </section>

              <section>
                <h3 className={H}>Before submitting</h3>
                <ul className="grid gap-1.5 text-xs leading-relaxed">
                  {data.limitations.map((r: string, i: number) => (
                    <li key={i} className="border-l-2 border-warn/60 pl-3">
                      {r}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">Research snapshot {date(data.researchAsOf)}. Nothing is sent to your broker.</p>
              </section>

              <div className="flex flex-wrap gap-3 border-t border-line pt-3">
                {data.sources.map((s: any) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
                    {s.title} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

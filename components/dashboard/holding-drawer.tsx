'use client';

import { useEffect, useState } from 'react';
import { X, TrendingUp, ExternalLink, BookOpen } from 'lucide-react';
import { date } from './shared';
import { JarvisScorecard } from './scorecard';
import { ReportEvidence } from '../report-evidence';
import { PriceChart } from '../terminal/price-chart';
import { SignalBadge, GateGlyphs, Segmented } from '../terminal/ui';
import { inr, px, pct, qty, tone, symbol } from '../terminal/format';
import { cn } from '@/lib/utils';

type Tab = 'checks' | 'why' | 'figures';

/** Holding detail panel: price, position, Jarvis checks, report evidence and the reasoning behind the signal. */
export default function HoldingDrawer({ selected, setSelected, showExecution }: any) {
  const [tab, setTab] = useState<Tab>('checks');
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = '';
    };
  }, [setSelected]);
  if (!selected) return null;
  const h = selected;
  const day = h.quote?.price && h.quote?.previous ? (h.quote.price / h.quote.previous - 1) * 100 : null;
  const ret = h.invested ? ((h.unrealised || 0) / h.invested) * 100 : null;
  const f = h.fundamentals || {};

  return (
    <div className="fixed inset-0 z-[60] font-sans text-foreground">
      <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${h.ticker} details`}
        className="absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col border-l border-line bg-background shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start gap-3 border-b border-line bg-panel px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-lg font-semibold">{symbol(h.ticker)}</h2>
              <SignalBadge action={h.action} />
              <GateGlyphs scorecard={h.scorecard} />
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {h.portfolio} · {h.sector} · {h.ticker}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg font-semibold tabular-nums">{px(h.price, h.currency)}</div>
            <div className="font-mono text-[11px] tabular-nums">
              <span className={tone(day)}>{pct(day, { digits: 2 })}</span>
              <span className="text-muted-foreground"> · {h.quote?.stale ? 'stale · ' : ''}{date(h.quote?.time)}</span>
            </div>
          </div>
          <button onClick={() => setSelected(null)} aria-label="Close" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-line p-4">
            <PriceChart points={h.quote?.history || []} currency={h.currency} />
          </div>

          {/* Position */}
          <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4 [&>div]:bg-background [&>div]:px-4 [&>div]:py-2.5">
            {[
              ['Quantity', qty(h.shares)],
              ['Avg cost', px(h.avg, h.currency)],
              ['Value', inr(h.value)],
              ['P&L', <span key="p" className={tone(h.unrealised)}>{inr(h.unrealised, { signed: true })} <span className="text-[11px]">{pct(ret)}</span></span>],
              ['Weight', Number.isFinite(h.weight) ? `${h.weight.toFixed(1)}%` : '—'],
              ['Household', Number.isFinite(h.aggregateWeight) ? `${h.aggregateWeight.toFixed(1)}%` : '—'],
              ['Oldest lot', h.oldest || '—'],
              ['Last buy', h.lastBuy || '—'],
            ].map(([k, v]: any) => (
              <div key={k}>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
            <button
              onClick={() => showExecution(h.ticker, h.portfolio, undefined, true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <TrendingUp className="size-3.5" /> Price plan
            </button>
            <a href={'/reports?ticker=' + encodeURIComponent(h.ticker)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs hover:bg-hover">
              <BookOpen className="size-3.5" /> Annual reports
            </a>
            <a
              href={'https://finance.yahoo.com/quote/' + encodeURIComponent(h.ticker)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs text-muted-foreground hover:bg-hover hover:text-foreground"
            >
              Yahoo <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="sticky top-0 z-10 border-b border-line bg-background/95 px-4 py-2 backdrop-blur">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'checks', label: 'Checks' },
                { value: 'why', label: 'Why', count: (h.reasons?.length || 0) + (h.risks?.length || 0) },
                { value: 'figures', label: 'Figures' },
              ]}
            />
          </div>

          <div className="p-4">
            {tab === 'checks' && (
              <div>
                <JarvisScorecard scorecard={h.scorecard} price={h.price} currency={h.currency} />
                <ReportEvidence ticker={h.ticker} scorecard={h.scorecard} />
              </div>
            )}

            {tab === 'why' && (
              <div className="grid gap-5 text-sm">
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Why this signal</h3>
                  <ul className="grid gap-1.5">
                    {(h.reasons || []).map((r: string, i: number) => (
                      <li key={i} className="border-l-2 border-brand/60 pl-3 leading-relaxed">{r}</li>
                    ))}
                  </ul>
                </section>
                {h.quantity !== null && h.quantity !== undefined && (
                  <section className="rounded-md border border-warn/40 bg-warn-soft p-3">
                    <strong className="text-warn">Proposal: trim {h.quantity} shares</strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Estimated proceeds {inr(h.amount)} at the displayed price. Check price, tax and costs before placing an order.
                    </p>
                  </section>
                )}
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Risks & evidence gaps</h3>
                  <ul className="grid gap-1.5">
                    {(h.risks || []).map((r: string, i: number) => (
                      <li key={i} className="border-l-2 border-warn/60 pl-3 leading-relaxed">{r}</li>
                    ))}
                    {!h.risks?.length && <li className="text-muted-foreground">None recorded.</li>}
                  </ul>
                </section>
                {h.accounting && (
                  <section>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Accounting</h3>
                    <p className="leading-relaxed">{h.accounting}</p>
                  </section>
                )}
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Thesis notes</h3>
                  {h.notes?.length ? (
                    h.notes.map((n: any, i: number) => (
                      <blockquote key={i} className="mb-2 rounded-md border border-line bg-panel p-3">
                        <div className="mb-1 font-mono text-[11px] text-muted-foreground">
                          {n.date} · {n.type}
                        </div>
                        {n.note}
                      </blockquote>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No thesis notes recorded for this position.</p>
                  )}
                </section>
              </div>
            )}

            {tab === 'figures' && (
              <div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Latest annual period {f.date || 'unavailable'}. Single-year context; the checklist uses the multi-year history.
                </p>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4 [&>div]:bg-panel [&>div]:p-3">
                  {(
                    [
                      ['ROE', f.roe, 'pct'],
                      ['Revenue growth', f.revenueGrowth, 'pct'],
                      ['Earnings growth', f.earningsGrowth, 'pct'],
                      ['P/E', f.pe, 'x'],
                      ['P/B', f.pb, 'x'],
                      ['PEG', f.peg, 'x'],
                      ['Cash conversion', f.cashConversion, 'x'],
                      ['Debt / equity', f.debtEquity, 'x'],
                    ] as const
                  ).map(([k, v, kind]) => (
                    <div key={k}>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</dt>
                      <dd className={cn('mt-0.5 font-mono text-sm tabular-nums', kind === 'pct' && tone(v))}>
                        {v === null || v === undefined ? '—' : kind === 'pct' ? pct(v) : `${(v as number).toFixed(2)}×`}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

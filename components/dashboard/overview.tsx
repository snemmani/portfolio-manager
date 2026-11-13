'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { useHoldings, useAnalysis, useHoldingReviewPolicy } from './view-data';
import type { ViewProps } from './types';
import { mergeRecommendations } from '../../lib/merge-recommendations';
import { actionPriority, actionLabel } from '../../lib/recommendation-order';
import { cardText } from '../../lib/card-copy';
import { HoldingsGrid } from '../terminal/holdings-grid';
import { Panel, Kpi, SignalBadge, Empty } from '../terminal/ui';
import { inr, pct, symbol, tone } from '../terminal/format';
import { cn } from '@/lib/utils';

export default function OverviewView({ data, portfolio, navigate, setSelected }: ViewProps) {
  const holdings = useHoldings(data, portfolio);
  const [search, setSearch] = useState('');
  const analysis = useAnalysis(true).data;
  const reviewPolicy = useHoldingReviewPolicy(data);
  const priorities = useMemo(
    () =>
      mergeRecommendations(holdings, analysis?.report?.recommendations || [], reviewPolicy)
        .filter((r: any) => actionPriority(r.action) <= 3 && !/^review$/i.test(String(r.action)))
        .sort((a: any, b: any) => actionPriority(a.action) - actionPriority(b.action)),
    [holdings, analysis, reviewPolicy],
  );
  const totals = data?.portfolios?.find((p: any) => p.name === portfolio) || data?.totals;
  const unrealised = totals && !totals.unpriced ? totals.equity - totals.invested : null;
  const unrealisedPct = totals?.invested && !totals?.unpriced ? (totals.equity / totals.invested - 1) * 100 : null;

  const sectors = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of holdings) map[h.sector || 'Unclassified'] = (map[h.sector || 'Unclassified'] || 0) + (h.value || 0);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [holdings]);
  const equity = sectors.reduce((n, [, v]) => n + v, 0);

  const health = useMemo(() => {
    const companies = [...new Map(holdings.filter((h: any) => !h.nonDiscretionary).map((h: any) => [h.ticker, h])).values()] as any[];
    const scored = companies.filter((h) => h.scorecard?.gates?.length);
    return {
      total: scored.length || companies.length,
      clean: scored.filter((h) => h.scorecard.status === 'eligible').length,
      failing: scored.filter((h) => h.scorecard.gates.some((g: any) => g.status === 'fail')),
      below: scored.filter((h) => h.scorecard.intrinsic?.value && h.price <= h.scorecard.intrinsic.value).length,
    };
  }, [holdings]);

  const open = (h: any) => setSelected(holdings.find((x: any) => x.ticker === h.ticker && x.portfolio === h.portfolio) || h);

  return (
    <div className="grid gap-3">
      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 xl:grid-cols-6 [&>*]:bg-panel">
        <Kpi
          label="Portfolio value"
          value={inr(totals?.value)}
          sub={
            totals?.unpriced
              ? 'Partial · missing prices'
              : portfolio === 'All portfolios' && data?.hiddenPortfolios?.length
                ? `Excl. locked ${data.hiddenPortfolios.map((p: any) => `${p.name} ${inr(p.value)}`).join(', ')}`
                : 'Equities + cash'
          }
        />
        <Kpi label="Invested" value={inr(totals?.invested)} sub="FIFO cost basis" />
        <Kpi label="Unrealised" value={inr(unrealised, { signed: true })} tone={tone(unrealised)} sub={<span className={tone(unrealisedPct)}>{pct(unrealisedPct)} · current FX</span>} />
        <Kpi label="Cash" value={inr(totals?.cash)} sub={<span className="text-brand">Deploy →</span>} onClick={() => navigate('Deploy cash')} />
        <Kpi label="Decisions" value={priorities.length} tone={priorities.length ? 'text-warn' : undefined} sub="Trims, exits, profit reviews" onClick={() => navigate('Recommendations')} />
        <Kpi label="Gates pass" value={`${health.clean}/${health.total}`} tone={health.failing.length ? undefined : 'text-gain'} sub={`${health.failing.length} failing · ${health.below} under value`} onClick={() => navigate('Framework')} />
      </section>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Needs you */}
        <Panel
          title="Needs you"
          meta={priorities.length || undefined}
          flush
          actions={
            <button onClick={() => navigate('Recommendations')} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
              All decisions <ArrowRight className="size-3" />
            </button>
          }
        >
          {priorities.length ? (
            <ul className="divide-y divide-line">
              {priorities.slice(0, 6).map((h: any) => (
                <li key={h.portfolio + h.ticker}>
                  <button onClick={() => open(h)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left hover:bg-hover">
                    <SignalBadge action={actionLabel(h.action)} label={h.action==='Review'?h.holding?.purchaseStep?.label:undefined} title={h.holding?.purchaseStep?.reason} className="max-w-48 justify-center" />
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] font-semibold">{symbol(h.ticker)}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{h.portfolio}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{cardText(h.reasons?.[0] || 'Review the supporting information')}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              <ShieldCheck className="mx-auto mb-2 size-5 text-gain" />
              Nothing needs a decision right now.
            </Empty>
          )}
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {/* Sector exposure */}
          <Panel title="Sector exposure" meta={inr(equity)}>
            <ul className="grid gap-1.5">
              {sectors.slice(0, 7).map(([sector, value]) => {
                const w = equity > 0 ? (value / equity) * 100 : 0;
                return (
                  <li key={sector} className="grid grid-cols-[96px_minmax(0,1fr)_44px] items-center gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{sector}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-raised">
                      <span className={cn('block h-full', w > 25 ? 'bg-warn' : 'bg-brand')} style={{ width: `${Math.min(100, w)}%` }} />
                    </span>
                    <span className="text-right font-mono tabular-nums">{w.toFixed(1)}%</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
          {/* Gate health */}
          <Panel title="Gate health" actions={<button onClick={() => navigate('Framework')} className="text-xs text-brand hover:underline">How gates work</button>}>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [health.clean, 'All pass', 'text-gain'],
                [health.failing.length, 'Failing', health.failing.length ? 'text-loss' : ''],
                [health.below, 'Under value', ''],
              ].map(([n, l, t]: any) => (
                <div key={l} className="rounded-md bg-raised py-2">
                  <div className={cn('font-mono text-lg font-semibold tabular-nums', t)}>{n}</div>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{l}</div>
                </div>
              ))}
            </div>
            {health.failing.length > 0 && (
              <ul className="mt-2 grid gap-1 text-xs">
                {health.failing.slice(0, 4).map((h: any) => (
                  <li key={h.ticker} className="flex gap-2">
                    <button onClick={() => setSelected(h)} className="w-24 shrink-0 text-left font-mono font-semibold hover:text-brand">
                      {symbol(h.ticker)}
                    </button>
                    <span className="truncate text-muted-foreground">
                      {h.scorecard.gates.filter((g: any) => g.status === 'fail').map((g: any) => g.label).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* Holdings */}
      <Panel
        title="Largest holdings"
        meta={`${holdings.length} positions`}
        flush
        actions={
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…"
              className="h-7 w-40 rounded-md border border-line bg-background pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        }
      >
        <HoldingsGrid
          holdings={holdings}
          onSelect={setSelected}
          search={search}
          limit={search ? undefined : 12}
          footer={
            !search &&
            holdings.length > 12 && (
              <button onClick={() => navigate('Holdings')} className="flex w-full items-center justify-center gap-1 border-t border-line py-2 text-xs text-brand hover:bg-hover">
                All {holdings.length} holdings <ArrowRight className="size-3" />
              </button>
            )
          }
        />
      </Panel>
    </div>
  );
}

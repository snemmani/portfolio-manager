'use client';

import { Check, X, HelpCircle, Minus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Jarvis scorecard UI. Mandatory gates are pass / fail / evidence needed; warnings only
 * reduce the position size. Data comes from `scorecard` on holdings and candidates
 * (lib/jarvis-gates.ts).
 */

type Gate = { id: string; label: string; status: 'pass' | 'fail' | 'unknown' | 'deferred'; detail: string };
type Warning = { id: string; label: string; detail: string; weight: number };

const STATUS_TEXT: Record<string, string> = { pass: 'Pass', fail: 'Fails', unknown: 'Evidence needed', deferred: 'Checked in research' };
const STATUS_TONE: Record<string, string> = {
  pass: 'bg-gain-soft text-gain',
  fail: 'bg-loss-soft text-loss',
  unknown: 'bg-warn-soft text-warn',
  deferred: 'bg-raised text-muted-foreground',
};
const label = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

function GateIcon({ status }: { status: string }) {
  const c = 'size-3.5';
  if (status === 'pass') return <Check className={c} strokeWidth={3} />;
  if (status === 'fail') return <X className={c} strokeWidth={3} />;
  if (status === 'deferred') return <Minus className={c} strokeWidth={3} />;
  return <HelpCircle className={c} strokeWidth={2.5} />;
}

const VERDICT: Record<string, string> = {
  undemanding: 'Undemanding',
  'in-line': 'In line with history',
  demanding: 'Demanding',
  unrealistic: 'Unrealistic',
  'value-destroying': 'Growth adds no value',
  unavailable: 'Unavailable',
};
const VERDICT_TONE: Record<string, string> = {
  undemanding: 'text-gain',
  'in-line': 'text-info',
  demanding: 'text-warn',
  unrealistic: 'text-loss',
  'value-destroying': 'text-loss',
  unavailable: 'text-muted-foreground',
};

/** Implied growth for tables and cards. */
export function ImpliedGrowth({ reverse }: { reverse: any }) {
  if (!reverse || reverse.verdict === 'unavailable') return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('font-mono text-xs font-semibold tabular-nums', VERDICT_TONE[reverse.verdict])} title={reverse.summary}>
      {Number.isFinite(reverse.impliedGrowthPct) ? `${reverse.impliedGrowthPct}%` : VERDICT[reverse.verdict]}
    </span>
  );
}

/** Full checklist with details, warnings, valuation band and reverse DCF (holding drawer). */
export function JarvisScorecard({ scorecard, price, currency, research }: { scorecard: any; price?: number | null; currency?: string; research?: any }) {
  if (!scorecard?.gates?.length)
    return <p className="rounded-md border border-line bg-panel p-3 text-xs text-muted-foreground">Multi-year statements are not available yet, so the Jarvis gates cannot be checked.</p>;
  const gates: Gate[] = [...scorecard.gates, ...(research?.gates || []).filter((g: Gate) => g.id === 'marginOfSafety')];
  const warnings: Warning[] = (scorecard.warnings || []).filter((w: Warning) => w.weight);
  const notes: Warning[] = (scorecard.warnings || []).filter((w: Warning) => !w.weight);
  const m = scorecard.metrics || {};
  const fmt = (v: any, suffix = '') => (Number.isFinite(v) ? `${Math.round(v * 10) / 10}${suffix}` : '—');
  const verdict = scorecard.status === 'eligible' ? ['Mandatory checks pass', 'border-gain/40 bg-gain-soft text-gain'] : scorecard.status === 'rejected' ? ['A mandatory check fails', 'border-loss/40 bg-loss-soft text-loss'] : ['Evidence or conviction is short', 'border-warn/40 bg-warn-soft text-warn'];
  return (
    <div className="grid gap-3 text-sm">
      <div className={cn('rounded-md border px-3 py-2', verdict[1])}>
        <strong className="block text-sm">{verdict[0]}</strong>
        <span className="text-xs text-foreground/80">{scorecard.summary}</span>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
        {gates.map((g) => (
          <li key={g.id + g.status} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 px-3 py-2">
            <span className={cn('mt-0.5 grid size-5 place-items-center rounded-sm', STATUS_TONE[g.status])}>
              <GateIcon status={g.status} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <strong className="text-[13px]">{g.label}</strong>
                <span className="text-[11px] text-muted-foreground">{STATUS_TEXT[g.status]}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{g.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {warnings.length > 0 && (
        <div className="rounded-md border border-warn/40 bg-warn-soft p-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warn">
            <AlertTriangle className="size-3.5" /> {warnings.length} warning{warnings.length === 1 ? '' : 's'} · position capped at {warnings.length >= 3 ? '0% (watchlist)' : '3%'}
          </h4>
          <ul className="grid gap-1 text-xs">
            {warnings.map((w) => (
              <li key={w.id + w.detail}>
                <strong>{w.label}.</strong> <span className="text-foreground/80">{w.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {notes.map((w) => (
            <li key={w.id}>{w.detail}</li>
          ))}
        </ul>
      )}

      <ValuationBand price={price} currency={currency} scorecard={scorecard} maxEntry={research?.valuation?.maxEntry} />
      <ReverseDcfBlock reverse={scorecard.reverseDcf} />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4 [&>div]:bg-panel [&>div]:px-3 [&>div]:py-2">
        {(
          [
            ['Median ROCE', fmt(m.roceMedian, '%')],
            ['Median ROE', fmt(m.roeMedian, '%')],
            ['Revenue CAGR', fmt(m.revenueCagr, '%')],
            ['Profit CAGR', fmt(m.earningsCagr, '%')],
            ['Cash / profit 3y', Number.isFinite(m.cashConversionCumulative) ? Math.round(m.cashConversionCumulative * 100) + '%' : '—'],
            ['Debt / equity', fmt(m.debtEquity)],
            ['Altman Z', fmt(m.altmanZ)],
            ['Beneish M', fmt(m.beneishM)],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</dt>
            <dd className="font-mono text-sm tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <small className="font-mono text-[11px] text-muted-foreground">
        {m.years || 0} annual periods through {m.latestPeriod || '—'} · Yahoo Finance statements
      </small>
    </div>
  );
}

/** Reverse DCF: the growth today's price requires, against what the company has delivered. */
function ReverseDcfBlock({ reverse }: { reverse: any }) {
  if (!reverse) return null;
  const implied = reverse.impliedGrowthPct, hist = reverse.historicalGrowthPct;
  const max = Math.max(5, ...[implied, hist].filter((v) => Number.isFinite(v)).map((v) => Math.abs(v))) * 1.15;
  const bar = (v: number) => `${Math.max(0, Math.min(100, (Math.max(0, v) / max) * 100))}%`;
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={label}>Reverse DCF</span>
        <span className={cn('text-xs font-semibold', VERDICT_TONE[reverse.verdict])}>{VERDICT[reverse.verdict]}</span>
      </div>
      {Number.isFinite(implied) && (
        <div className="mb-2 grid gap-1.5 text-xs">
          {[
            ['Price implies', implied, VERDICT_TONE[reverse.verdict].replace('text-', 'bg-')],
            ...(Number.isFinite(hist) ? [['Delivered', hist, 'bg-line-strong']] : []),
          ].map(([k, v, c]: any) => (
            <div key={k} className="grid grid-cols-[88px_minmax(0,1fr)_52px] items-center gap-2">
              <span className="text-muted-foreground">{k}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-raised">
                <span className={cn('block h-full', c)} style={{ width: bar(v) }} />
              </span>
              <span className="text-right font-mono tabular-nums">{v}%</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs leading-relaxed">{reverse.summary}</p>
      <small className="mt-1 block text-[11px] text-muted-foreground">
        Same model as the code value: {reverse.assumptions?.discountPct}% discount, fading to {reverse.assumptions?.terminalGrowthPct}% long-run growth.
      </small>
    </div>
  );
}

/** Price against the code valuation and the researched maximum entry. */
function ValuationBand({ price, currency, scorecard, maxEntry }: { price?: number | null; currency?: string; scorecard: any; maxEntry?: number | null }) {
  const value = scorecard?.intrinsic?.value;
  const research = Number.isFinite(maxEntry) && (maxEntry as number) > 0 ? (maxEntry as number) : null;
  const points = (
    [
      { key: 'Code value', v: value, dot: 'bg-brand' },
      { key: 'Research max entry', v: research, dot: 'bg-info' },
      { key: 'Price', v: price, dot: 'bg-foreground' },
    ] as { key: string; v: any; dot: string }[]
  ).filter((p) => Number.isFinite(p.v));
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.v)) * 1.08;
  const ceiling = Math.min(...([scorecard?.intrinsic?.binding === false ? null : value, research].filter((v) => Number.isFinite(v)) as number[]));
  const fmt = (v: number) => (currency === 'USD' ? '$' : '₹') + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const below = Number.isFinite(ceiling) && Number.isFinite(price) && (price as number) <= ceiling;
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={label}>Margin of safety</span>
        {Number.isFinite(ceiling) && Number.isFinite(price) && (
          <span className={cn('text-xs font-semibold', below ? 'text-gain' : 'text-loss')}>
            {below ? `${Math.round((1 - (price as number) / ceiling) * 100)}% below the buy ceiling` : `Needs a ${Math.round((1 - ceiling / (price as number)) * 100)}% fall to reach the buy ceiling`}
          </span>
        )}
      </div>
      <div className="relative h-3 rounded-full bg-raised">
        {Number.isFinite(ceiling) && <span className="absolute inset-y-0 left-0 rounded-full bg-gain/25" style={{ width: `${(ceiling / max) * 100}%` }} />}
        {points.map((p) => (
          <span key={p.key} className={cn('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel', p.dot)} style={{ left: `${(p.v / max) * 100}%` }} title={`${p.key}: ${fmt(p.v)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {points.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <i className={cn('block size-2 rounded-full', p.dot)} />
            {p.key} <strong className="font-mono text-foreground tabular-nums">{fmt(p.v)}</strong>
          </span>
        ))}
      </div>
      {scorecard?.intrinsic?.binding === false && <small className="mt-1 block text-[11px] text-muted-foreground">{scorecard.intrinsic.note}</small>}
    </div>
  );
}

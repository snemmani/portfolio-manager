'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Terminal building blocks: one surface level, hairline borders, colour only for meaning. */

export function Panel({ title, meta, actions, children, className, flush = false }: { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn('min-w-0 rounded-md border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
          {title && <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>}
          {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-3'}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; onClick?: () => void }) {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cn('min-w-0 px-3 py-2.5 text-left', onClick && 'cursor-pointer hover:bg-hover')}>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn('mt-1 truncate font-mono text-xl font-semibold tabular-nums', tone)}>{value}</div>
      {sub && <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{sub}</div>}
    </Tag>
  );
}

const SIGNAL: Record<string, string> = {
  Trim: 'bg-loss-soft text-loss border-loss/30',
  'Trim review': 'bg-loss-soft text-loss border-loss/30',
  'Exit review': 'bg-loss-soft text-loss border-loss/30',
  'Profit review': 'bg-warn-soft text-warn border-warn/30',
  Watch: 'bg-warn-soft text-warn border-warn/30',
  'Add candidate': 'bg-gain-soft text-gain border-gain/30',
  Buy: 'bg-gain-soft text-gain border-gain/30',
  Hold: 'bg-info-soft text-info border-info/30',
  Locked: 'bg-raised text-muted-foreground border-line',
  Review: 'bg-raised text-muted-foreground border-line',
};
export function SignalBadge({ action, className }: { action: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-sm border px-1.5 text-[11px] font-semibold', SIGNAL[action] || 'border-line bg-raised text-muted-foreground', className)}>
      {action}
    </span>
  );
}

const GATE_SHORT: Record<string, string> = { integrity: 'Data', solvency: 'Solvency', earningsQuality: 'Earnings', returnOnCapital: 'Returns', marginOfSafety: 'Value' };
const GATE_TEXT: Record<string, string> = { pass: 'Pass', fail: 'Fails', unknown: 'Evidence needed', deferred: 'Checked in research' };
/** Mandatory gates as block glyphs: filled green pass, filled red fail, amber outline evidence needed, grey deferred. */
export function GateGlyphs({ scorecard, labels = false }: { scorecard: any; labels?: boolean }) {
  if (!scorecard?.gates?.length) return <span className="font-mono text-[11px] text-muted-foreground">pending</span>;
  const warnings = scorecard.warningCount || 0;
  return (
    <span className="inline-flex items-center gap-1" aria-label={scorecard.summary}>
      {scorecard.gates.map((g: any) => (
        <span
          key={g.id}
          title={`${g.label}: ${GATE_TEXT[g.status] || g.status} — ${g.detail}`}
          className={cn(
            'inline-flex items-center gap-1',
            labels && 'rounded-sm border border-line px-1 py-0.5 text-[11px]',
          )}
        >
          <i
            className={cn(
              'block size-2.5 rounded-[2px]',
              g.status === 'pass' && 'bg-gain',
              g.status === 'fail' && 'bg-loss',
              g.status === 'unknown' && 'border border-warn bg-transparent',
              g.status === 'deferred' && 'bg-line-strong',
            )}
          />
          {labels && <span className="text-muted-foreground">{GATE_SHORT[g.id] || g.label}</span>}
        </span>
      ))}
      {warnings > 0 && (
        <span
          className="ml-0.5 font-mono text-[11px] font-semibold text-warn"
          title={(scorecard.warnings || []).filter((w: any) => w.weight).map((w: any) => `${w.label}: ${w.detail}`).join('\n')}
        >
          ⚠{warnings}
        </span>
      )}
    </span>
  );
}

/** Price as a percentage of the code valuation. */
export function ValuePct({ price, scorecard }: { price?: number | null; scorecard: any }) {
  const value = scorecard?.intrinsic?.value;
  if (!Number.isFinite(price) || !Number.isFinite(value) || value <= 0) return <span className="text-muted-foreground">—</span>;
  const r = (price as number) / value;
  return (
    <span
      className={cn('font-mono tabular-nums', r <= 1 ? 'text-gain' : r <= 1.3 ? 'text-warn' : 'text-muted-foreground')}
      title={[scorecard.intrinsic.method, scorecard.reverseDcf?.summary].filter(Boolean).join('\n')}
    >
      {Math.round(r * 100)}%{scorecard.intrinsic.binding === false ? '*' : ''}
    </span>
  );
}

/** Minimal sparkline (no fill) for dense rows. */
export function Sparkline({ points, width = 84, height = 22 }: { points: any[]; width?: number; height?: number }) {
  const v = (points || []).map((p) => p?.close).filter((x) => Number.isFinite(x));
  if (v.length < 2) return <span className="text-[11px] text-muted-foreground">—</span>;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const d = v.map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * width).toFixed(1)},${(height - 2 - ((y - lo) / span) * (height - 4)).toFixed(1)}`).join('');
  const up = v.at(-1)! >= v[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={up ? 'text-gain' : 'text-loss'} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}

/** Weight with a thin bar; the bar caps at the 15% single-stock limit. */
export function WeightBar({ weight, cap = 15 }: { weight: number | null | undefined; cap?: number }) {
  if (!Number.isFinite(weight)) return <span className="text-muted-foreground">—</span>;
  const over = (weight as number) > cap;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className={cn('font-mono tabular-nums', over && 'text-warn')}>{(weight as number).toFixed(1)}%</span>
      <span className="block h-[3px] w-12 overflow-hidden rounded-full bg-raised">
        <span className={cn('block h-full', over ? 'bg-warn' : 'bg-brand')} style={{ width: `${Math.min(100, ((weight as number) / cap) * 100)}%` }} />
      </span>
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex flex-wrap rounded-md border border-line bg-background p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
            value === o.value && 'bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--t-border)]',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="font-mono text-[10px] text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

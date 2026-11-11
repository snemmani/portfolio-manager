'use client';

import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { pct } from './format';
import { Segmented } from './ui';

const RANGES = { '1M': 22, '3M': 66, '6M': 132, '1Y': 366 } as const;
type Range = keyof typeof RANGES;

/** Price history with range switch, area fill and hover read-out. */
export function PriceChart({ points, currency = 'INR', height = 180 }: { points: any[]; currency?: string; height?: number }) {
  const [range, setRange] = useState<Range>('6M');
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const series = useMemo(() => (points || []).filter((p) => Number.isFinite(p?.close)).slice(-RANGES[range]), [points, range]);
  if (series.length < 2) return <div className="grid h-32 place-items-center text-xs text-muted-foreground">Price history unavailable</div>;
  const W = 600, H = height, pad = 4;
  const v = series.map((p) => p.close), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (c: number) => pad + (1 - (c - lo) / span) * (H - pad * 2);
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join('');
  const up = v.at(-1)! >= v[0];
  const change = (v.at(-1)! / v[0] - 1) * 100;
  const h = hover !== null ? series[hover] : null;
  const fmt = (c: number) => (currency === 'USD' ? '$' : '₹') + c.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-mono text-xs tabular-nums">
          {h ? (
            <>
              <span className="text-foreground">{fmt(h.close)}</span> <span className="text-muted-foreground">{h.date}</span>
            </>
          ) : (
            <>
              <span className={up ? 'text-gain' : 'text-loss'}>{pct(change)}</span> <span className="text-muted-foreground">over {range}</span>
            </>
          )}
        </div>
        <Segmented value={range} onChange={setRange} options={(Object.keys(RANGES) as Range[]).map((r) => ({ value: r, label: r }))} />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={cn('block h-[180px] w-full touch-none', up ? 'text-gain' : 'text-loss')}
        style={{ height }}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect();
          setHover(Math.max(0, Math.min(series.length - 1, Math.round(((e.clientX - r.left) / r.width) * (series.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Price ${pct(change)} over ${range}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--t-border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--t-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{series[0].date}</span>
        <span>
          L {fmt(lo)} · H {fmt(hi)}
        </span>
        <span>{series.at(-1).date}</span>
      </div>
    </div>
  );
}

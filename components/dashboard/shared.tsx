'use client';
import { GateChips, ValueTag } from './scorecard';

import { useMemo, useState, useId } from 'react';
import { LockKeyhole, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { actionPriority } from '../../lib/recommendation-order';
import { formatIST } from '../../lib/time';

export const money = (v: any, c = 'INR') =>
  v === null || v === undefined
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: c,
        maximumFractionDigits: 2,
      }).format(v);

export const compact = (v: any) =>
  v === null || v === undefined
    ? '—'
    : Math.abs(v) >= 1e7
    ? `₹${(v / 1e7).toFixed(2)}Cr`
    : Math.abs(v) >= 1e5
    ? `₹${(v / 1e5).toFixed(2)}L`
    : money(v);

export const percent = (v: any) =>
  v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export const date = formatIST;

export const badge = (a: string) =>
  actionPriority(a) <= 1
    ? 'amber'
    : actionPriority(a) === 2
    ? 'green'
    : actionPriority(a) === 3
    ? 'violet'
    : actionPriority(a) === 6
    ? 'gray'
    : 'blue';

export function Spark({
  points,
  color = '#059669',
  large = false,
}: {
  points: any[];
  color?: string;
  large?: boolean;
}) {
  const gradientId = useId();
  const values = points.map((p) => p.close).filter(Number.isFinite);
  if (values.length < 2)
    return (
      <div
        className="empty-chart"
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--muted)',
          display: 'grid',
          placeItems: 'center',
          height: large ? '180px' : '32px',
        }}
      >
        Price history unavailable
      </div>
    );

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const height = large ? 200 : 34;
  const width = large ? 850 : 110;
  const isNegative =
    color === '#c44d52' || color === '#e11d48' || color === 'var(--negative)';
  const chartColor = isNegative ? 'var(--negative)' : 'var(--positive)';
  const p = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * width},${
          height - 6 - ((v - lo) / (hi - lo || 1)) * (height - 12)
        }`
    )
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={large ? 'price-chart' : 'spark'}
      aria-label="Historical stock prices"
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={chartColor}
            stopOpacity={large ? '0.25' : '0.15'}
          />
          <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {large &&
        [0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="0"
            x2={width}
            y1={i * 60 + 10}
            y2={i * 60 + 10}
            stroke="var(--chart-grid)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        ))}
      <polygon
        points={`0,${height} ${p} ${width},${height}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={p}
        fill="none"
        stroke={chartColor}
        strokeWidth={large ? 2.2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown" style={{ lineHeight: 1.7, color: 'var(--ink)' }}>
      {text.split('\n').map((line, i) => {
        const clean = line.replace(/\*\*/g, '');
        if (/^#{1,4}\s/.test(clean))
          return (
            <h3
              key={i}
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                margin: '16px 0 8px',
                color: 'var(--ink)',
              }}
            >
              {clean.replace(/^#+\s/, '')}
            </h3>
          );
        if (clean.startsWith('|'))
          return (
            <div
              key={i}
              className="report-row"
              style={{
                fontFamily: 'monospace',
                fontSize: 'var(--text-xs)',
                background: 'var(--surface-alt)',
                padding: '6px 10px',
                borderRadius: '4px',
                margin: '2px 0',
              }}
            >
              {clean}
            </div>
          );
        return (
          <p key={i} style={{ margin: '6px 0' }}>
            {clean || '\u00a0'}
          </p>
        );
      })}
    </div>
  );
}

export function HoldingsTable({
  holdings,
  setSelected,
  search = '',
  filter = 'All actions',
}: any) {
  const [sort, setSort] = useState('value');
  const [desc, setDesc] = useState(true);

  const visible = useMemo(
    () =>
      holdings
        .filter(
          (h: any) =>
            (h.ticker + ' ' + h.sector + ' ' + h.portfolio)
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            (filter === 'All actions' || h.action === filter)
        )
        .sort((a: any, b: any) => {
          const x = a[sort];
          const y = b[sort];
          if (x === null) return 1;
          if (y === null) return -1;
          return (
            (typeof x === 'string' ? x.localeCompare(y) : x - y) * (desc ? -1 : 1)
          );
        }),
    [holdings, search, filter, sort, desc]
  );

  const sortIcon = (key: string) => {
    if (sort !== key)
      return (
        <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: '4px' }} />
      );
    return desc ? (
      <ArrowDown size={12} style={{ marginLeft: '4px', color: 'var(--accent)' }} />
    ) : (
      <ArrowUp size={12} style={{ marginLeft: '4px', color: 'var(--accent)' }} />
    );
  };

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {[
              ['ticker', 'Symbol / portfolio', false],
              ['price', 'Price · shares', true],
              ['value', 'Market value', true],
              ['unrealised', 'Unrealised P&L', true],
              ['weight', 'Weight', true],
              ['action', 'Signal', false],
            ].map(([key, label, alignRight]) => (
              <th
                key={key as string}
                style={{ textAlign: alignRight ? 'right' : 'left' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (sort === key) setDesc(!desc);
                    else {
                      setSort(key as string);
                      setDesc(true);
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  {label}
                  {sortIcon(key as string)}
                </button>
              </th>
            ))}
            <th>Jarvis gates</th>
            <th>Price vs value</th>
            <th style={{ textAlign: 'center' }}>1 Year Trend</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((h: any) => (
            <tr
              key={h.portfolio + h.ticker}
              onClick={() => setSelected(h)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSelected(h);
              }}
              aria-label={`View ${h.ticker} evidence`}
            >
              <td>
                <div className="symbol-cell">
                  <span
                    className={'symbol-icon ' + badge(h.action)}
                    style={{ fontSize: '0.75rem', fontWeight: 700 }}
                  >
                    {h.ticker.slice(0, 2)}
                  </span>
                  <div>
                    <strong style={{ color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>
                      {h.ticker}
                    </strong>
                    <small
                      style={{
                        display: 'block',
                        color: 'var(--muted)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      {h.portfolio} · {h.sector}
                    </small>
                  </div>
                  {h.nonDiscretionary && (
                    <LockKeyhole
                      size={12}
                      style={{ color: 'var(--muted)', marginLeft: '4px' }}
                    />
                  )}
                </div>
              </td>
              <td
                className="num"
                style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
              >
                <strong>{money(h.price, h.currency)}</strong>
                <small
                  className={h.quote?.stale ? 'warn' : ''}
                  style={{ display: 'block', fontSize: '0.7rem' }}
                >
                  {h.shares.toLocaleString('en-IN', { maximumFractionDigits: 4 })} sh
                  {h.quote?.stale ? ' · delayed' : ''}
                </small>
              </td>
              <td
                className="num"
                style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
              >
                <strong>{money(h.value)}</strong>
              </td>
              <td
                className={
                  'num ' + ((h.unrealised || 0) >= 0 ? 'positive' : 'negative')
                }
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                }}
              >
                {money(h.unrealised)}
                <small
                  style={{
                    display: 'block',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                  }}
                >
                  {h.invested
                    ? percent(((h.unrealised || 0) / h.invested) * 100)
                    : '—'}
                </small>
              </td>
              <td
                className="num"
                style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
                  <span>{h.weight === null ? '—' : h.weight.toFixed(1) + '%'}</span>
                  <div className="weight-track">
                    <i
                      style={{
                        width: Math.min(h.weight || 0, 100) + '%',
                      }}
                    />
                  </div>
                </div>
              </td>
              <td>
                <span className={'badge ' + badge(h.action)}>{h.action}</span>
              </td>
              <td><GateChips scorecard={h.scorecard} compact /></td>
              <td><ValueTag price={h.price} scorecard={h.scorecard} /></td>
              <td style={{ textAlign: 'center' }}>
                <Spark
                  points={h.quote?.history || []}
                  color={
                    h.quote?.history?.at(-1)?.close >=
                    h.quote?.history?.[0]?.close
                      ? 'var(--positive)'
                      : 'var(--negative)'
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!visible.length && (
        <div
          className="empty"
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--muted)',
          }}
        >
          No holdings match these filters.
        </div>
      )}
    </div>
  );
}

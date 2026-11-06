'use client';

import { Check, X, HelpCircle, Minus, AlertTriangle } from 'lucide-react';

/**
 * Jarvis scorecard UI. Mandatory gates are pass / fail / evidence needed; warnings
 * only reduce the position size. Data comes from `scorecard` on holdings and
 * candidates (lib/jarvis-gates.ts).
 */

type Gate = { id: string; label: string; status: 'pass' | 'fail' | 'unknown' | 'deferred'; detail: string };
type Warning = { id: string; label: string; detail: string; weight: number };

const SHORT: Record<string, string> = {
  integrity: 'Data',
  solvency: 'Solvency',
  earningsQuality: 'Earnings',
  returnOnCapital: 'Returns',
  marginOfSafety: 'Value',
};

const STATUS_TEXT: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fails',
  unknown: 'Evidence needed',
  deferred: 'Checked in research',
};

function GateIcon({ status, size = 12 }: { status: string; size?: number }) {
  if (status === 'pass') return <Check size={size} strokeWidth={3} />;
  if (status === 'fail') return <X size={size} strokeWidth={3} />;
  if (status === 'deferred') return <Minus size={size} strokeWidth={3} />;
  return <HelpCircle size={size} strokeWidth={2.5} />;
}

/** One-line gate chips for tables and cards. */
export function GateChips({ scorecard, compact = false }: { scorecard: any; compact?: boolean }) {
  if (!scorecard?.gates?.length)
    return <span className="gate-chips gate-chips-empty">Multi-year check pending</span>;
  const warnings = scorecard.warningCount || 0;
  return (
    <span className="gate-chips" aria-label={scorecard.summary}>
      {scorecard.gates.map((g: Gate) => (
        <span
          key={g.id}
          className={'gate-chip gate-' + g.status}
          title={`${g.label}: ${STATUS_TEXT[g.status]} — ${g.detail}`}
        >
          <GateIcon status={g.status} size={11} />
          {!compact && SHORT[g.id]}
        </span>
      ))}
      {warnings > 0 && (
        <span
          className="gate-chip gate-warning"
          title={(scorecard.warnings || [])
            .filter((w: Warning) => w.weight)
            .map((w: Warning) => `${w.label}: ${w.detail}`)
            .join('\n')}
        >
          <AlertTriangle size={11} />
          {warnings}
        </span>
      )}
    </span>
  );
}

/** Price relative to the code valuation, e.g. "135% of value". */
export function ValueTag({ price, scorecard }: { price?: number | null; scorecard: any }) {
  const value = scorecard?.intrinsic?.value;
  if (!Number.isFinite(price) || !Number.isFinite(value) || value <= 0) return <span className="value-tag muted">—</span>;
  const ratio = (price as number) / value;
  const tone = ratio <= 1 ? 'value-below' : ratio <= 1.3 ? 'value-near' : 'value-above';
  return (
    <span className={'value-tag ' + tone} title={[scorecard.intrinsic.method, scorecard.reverseDcf?.summary].filter(Boolean).join('\n')}>
      {Math.round(ratio * 100)}% of value{scorecard.intrinsic.binding === false ? '*' : ''}
    </span>
  );
}

/** Full checklist with details, warnings and the valuation band (holding drawer). */
export function JarvisScorecard({
  scorecard,
  price,
  currency,
  research,
}: {
  scorecard: any;
  price?: number | null;
  currency?: string;
  research?: any;
}) {
  if (!scorecard?.gates?.length)
    return (
      <div className="scorecard scorecard-empty">
        Multi-year statements are not available yet, so the Jarvis gates cannot be checked.
      </div>
    );
  const gates: Gate[] = [...scorecard.gates, ...(research?.gates || []).filter((g: Gate) => g.id === 'marginOfSafety')];
  const warnings: Warning[] = (scorecard.warnings || []).filter((w: Warning) => w.weight);
  const notes: Warning[] = (scorecard.warnings || []).filter((w: Warning) => !w.weight);
  const m = scorecard.metrics || {};
  const fmt = (v: any, suffix = '') => (Number.isFinite(v) ? `${Math.round(v * 10) / 10}${suffix}` : '—');
  return (
    <div className="scorecard">
      <div className={'scorecard-verdict verdict-' + scorecard.status}>
        <strong>
          {scorecard.status === 'eligible'
            ? 'Mandatory checks pass'
            : scorecard.status === 'rejected'
              ? 'A mandatory check fails'
              : 'Evidence or conviction is short'}
        </strong>
        <span>{scorecard.summary}</span>
      </div>
      <ul className="gate-list">
        {gates.map((g) => (
          <li key={g.id + g.status} className={'gate-row gate-' + g.status}>
            <span className="gate-icon">
              <GateIcon status={g.status} size={13} />
            </span>
            <div>
              <strong>{g.label}</strong>
              <small>{STATUS_TEXT[g.status]}</small>
              <p>{g.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {warnings.length > 0 && (
        <div className="warning-list">
          <h4>
            <AlertTriangle size={13} /> {warnings.length} warning{warnings.length === 1 ? '' : 's'} · position capped at{' '}
            {warnings.length >= 3 ? '0% (watchlist)' : '3%'}
          </h4>
          <ul>
            {warnings.map((w) => (
              <li key={w.id + w.detail}>
                <strong>{w.label}.</strong> {w.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((w) => (
            <li key={w.id}>{w.detail}</li>
          ))}
        </ul>
      )}
      <ValuationBand price={price} currency={currency} scorecard={scorecard} maxEntry={research?.valuation?.maxEntry} />
      <ReverseDcfBlock reverse={scorecard.reverseDcf} />
      <dl className="metric-grid">
        <div><dt>Median ROCE</dt><dd>{fmt(m.roceMedian, '%')}</dd></div>
        <div><dt>Median ROE</dt><dd>{fmt(m.roeMedian, '%')}</dd></div>
        <div><dt>Revenue CAGR</dt><dd>{fmt(m.revenueCagr, '%')}</dd></div>
        <div><dt>Profit CAGR</dt><dd>{fmt(m.earningsCagr, '%')}</dd></div>
        <div><dt>Cash / profit (3y)</dt><dd>{Number.isFinite(m.cashConversionCumulative) ? Math.round(m.cashConversionCumulative * 100) + '%' : '—'}</dd></div>
        <div><dt>Debt / equity</dt><dd>{fmt(m.debtEquity)}</dd></div>
        <div><dt>Altman Z</dt><dd>{fmt(m.altmanZ)}</dd></div>
        <div><dt>Beneish M</dt><dd>{fmt(m.beneishM)}</dd></div>
      </dl>
      <small className="scorecard-source">
        {m.years || 0} annual periods through {m.latestPeriod || '—'} · Yahoo Finance statements
      </small>
    </div>
  );
}

const VERDICT: Record<string, string> = {
  undemanding: 'Undemanding',
  'in-line': 'In line with history',
  demanding: 'Demanding',
  unrealistic: 'Unrealistic',
  'value-destroying': 'Growth adds no value',
  unavailable: 'Unavailable',
};

/** Implied growth chip for cards and tables. */
export function ImpliedGrowth({ reverse }: { reverse: any }) {
  if (!reverse || reverse.verdict === 'unavailable') return <span className="value-tag muted">—</span>;
  return (
    <span className={'implied-tag implied-' + reverse.verdict} title={reverse.summary}>
      {Number.isFinite(reverse.impliedGrowthPct) ? `${reverse.impliedGrowthPct}% implied` : VERDICT[reverse.verdict]}
    </span>
  );
}

/** Reverse DCF: the growth today's price requires, against what the company has delivered. */
function ReverseDcfBlock({ reverse }: { reverse: any }) {
  if (!reverse) return null;
  const implied = reverse.impliedGrowthPct, hist = reverse.historicalGrowthPct;
  const max = Math.max(5, ...[implied, hist].filter((v) => Number.isFinite(v)).map((v) => Math.abs(v))) * 1.15;
  const bar = (v: number) => `${Math.max(0, Math.min(100, (Math.max(0, v) / max) * 100))}%`;
  return (
    <div className="reverse-dcf">
      <div className="band-head">
        <strong>Reverse DCF</strong>
        <span className={'implied-tag implied-' + reverse.verdict}>{VERDICT[reverse.verdict]}</span>
      </div>
      {Number.isFinite(implied) && (
        <div className="rdcf-bars">
          <div><span>Price implies</span><i style={{ width: bar(implied) }} className="rdcf-implied" /><strong>{implied}%</strong></div>
          {Number.isFinite(hist) && <div><span>Delivered</span><i style={{ width: bar(hist) }} className="rdcf-hist" /><strong>{hist}%</strong></div>}
        </div>
      )}
      <p>{reverse.summary}</p>
      <small>Same model as the code value: {reverse.assumptions?.discountPct}% discount rate, fading to {reverse.assumptions?.terminalGrowthPct}% long-run growth.</small>
    </div>
  );
}

/** Price against the code valuation and the researched maximum entry. */
function ValuationBand({ price, currency, scorecard, maxEntry }: { price?: number | null; currency?: string; scorecard: any; maxEntry?: number | null }) {
  const value = scorecard?.intrinsic?.value;
  const points = [
    { key: 'Code value', v: value },
    { key: 'Research max entry', v: Number.isFinite(maxEntry) && (maxEntry as number) > 0 ? maxEntry : null },
    { key: 'Price', v: price },
  ].filter((p) => Number.isFinite(p.v)) as { key: string; v: number }[];
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.v)) * 1.08;
  const ceiling = Math.min(
    ...[scorecard?.intrinsic?.binding === false ? null : value, Number.isFinite(maxEntry) && (maxEntry as number) > 0 ? maxEntry : null].filter((v) => Number.isFinite(v)) as number[],
  );
  const fmt = (v: number) => (currency === 'USD' ? '$' : '₹') + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return (
    <div className="valuation-band">
      <div className="band-head">
        <strong>Margin of safety</strong>
        {Number.isFinite(ceiling) && Number.isFinite(price) && (
          <span className={(price as number) <= ceiling ? 'positive' : 'negative'}>
            {(price as number) <= ceiling
              ? `${Math.round((1 - (price as number) / ceiling) * 100)}% below the buy ceiling`
              : `Needs a ${Math.round((1 - ceiling / (price as number)) * 100)}% fall to reach the buy ceiling`}
          </span>
        )}
      </div>
      <div className="band-track">
        {Number.isFinite(ceiling) && <span className="band-zone" style={{ width: `${(ceiling / max) * 100}%` }} />}
        {points.map((p) => (
          <span key={p.key} className={'band-mark mark-' + p.key.split(' ')[0].toLowerCase()} style={{ left: `${(p.v / max) * 100}%` }} title={`${p.key}: ${fmt(p.v)}`} />
        ))}
      </div>
      <div className="band-legend">
        {points.map((p) => (
          <span key={p.key} className={'legend-' + p.key.split(' ')[0].toLowerCase()}>
            {p.key} <strong>{fmt(p.v)}</strong>
          </span>
        ))}
      </div>
      {scorecard?.intrinsic?.binding === false && <small className="band-note">{scorecard.intrinsic.note}</small>}
    </div>
  );
}

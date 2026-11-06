'use client';

import { X, TrendingUp, ExternalLink } from 'lucide-react';
import { Spark, money, percent, date, badge } from './shared';
import { JarvisScorecard } from './scorecard';

export default function HoldingDrawer({
  selected,
  setSelected,
  showExecution,
}: any) {
  if (!selected) return null;

  return (
    <div className="drawer-backdrop" onClick={() => setSelected(null)}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${selected.ticker} evidence`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-drawer icon-button"
          onClick={() => setSelected(null)}
          aria-label="Close details"
        >
          <X size={20} />
        </button>

        <span className={'badge ' + badge(selected.action)}>
          {selected.action}
        </span>

        <h1 style={{ marginTop: '12px', marginBottom: '4px' }}>
          {selected.ticker}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', marginBottom: '16px' }}>
          {selected.portfolio} · {selected.sector}
        </p>

        <div className="detail-price">
          {money(selected.price, selected.currency)}
          <small>
            {date(selected.quote?.time)}
            {selected.quote?.stale ? ' · stale' : ''}
          </small>
        </div>

        <div style={{ margin: '16px 0 24px' }}>
          <Spark large points={selected.quote?.history || []} />
        </div>

        <div className="detail-grid">
          {[
            ['Shares', selected.shares],
            ['Weight', selected.weight === null ? '—' : selected.weight.toFixed(1) + '%'],
            ['Average cost', money(selected.avg, selected.currency)],
            [
              'Household exposure',
              selected.aggregateWeight === null
                ? '—'
                : selected.aggregateWeight.toFixed(1) + '%',
            ],
            ['Market value', money(selected.value)],
            ['Oldest open lot', selected.oldest],
          ].map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <strong>{v}</strong>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', margin: '20px 0' }}>
          <button
            className="button primary"
            onClick={() =>
              showExecution(selected.ticker, selected.portfolio, undefined, true)
            }
          >
            <TrendingUp size={14} />
            Technical price plan
          </button>
          <a
            className="button"
            href={'/reports?ticker=' + encodeURIComponent(selected.ticker)}
          >
            Annual reports
          </a>
        </div>

        <h3>Jarvis checklist</h3>
        <JarvisScorecard scorecard={selected.scorecard} price={selected.price} currency={selected.currency} />

        <h3 style={{ marginTop: '24px' }}>Why this signal</h3>
        {selected.reasons?.map((r: string, i: number) => (
          <p className="evidence-line" key={i}>
            {r}
          </p>
        ))}

        {selected.quantity !== null && selected.quantity !== undefined && (
          <div className="trade-proposal">
            <strong>Proposal: trim {selected.quantity} shares</strong>
            <p>
              Estimated proceeds {money(selected.amount)} at the displayed price. Review price, tax and execution costs before placing an order.
            </p>
          </div>
        )}

        <h3 style={{ marginTop: '24px' }}>Latest-year figures</h3>
        <p className="muted">
          Annual period {selected.fundamentals?.date || 'unavailable'}. Single-year figures are context; the checklist above uses the multi-year history.
        </p>
        <div className="detail-grid">
          {[
            ['ROE', selected.fundamentals?.roe, 'percent'],
            ['Revenue growth', selected.fundamentals?.revenueGrowth, 'percent'],
            ['Earnings growth', selected.fundamentals?.earningsGrowth, 'percent'],
            ['P/E', selected.fundamentals?.pe, 'ratio'],
            ['P/B', selected.fundamentals?.pb, 'ratio'],
            ['PEG', selected.fundamentals?.peg, 'ratio'],
            ['Cash conversion', selected.fundamentals?.cashConversion, 'ratio'],
            ['Debt / equity', selected.fundamentals?.debtEquity, 'ratio'],
          ].map(([k, v, fmt]: any) => (
            <div key={k}>
              <small>{k}</small>
              <strong>
                {v === null || v === undefined
                  ? 'Not available'
                  : fmt === 'percent'
                  ? percent(v)
                  : v.toFixed(2) + '×'}
              </strong>
            </div>
          ))}
        </div>

        <p style={{ marginTop: '16px' }}>
          <strong>Accounting:</strong> {selected.accounting}
        </p>

        <h3 style={{ marginTop: '24px' }}>Risks & evidence gaps</h3>
        {selected.risks?.map((r: string, i: number) => (
          <p className="evidence-line risk-line" key={i}>
            {r}
          </p>
        ))}

        <h3 style={{ marginTop: '24px' }}>Stored thesis notes</h3>
        {selected.notes?.length ? (
          selected.notes.map((n: any, i: number) => (
            <blockquote key={i}>
              <small>
                {n.date} · {n.type}
              </small>
              {n.note}
            </blockquote>
          ))
        ) : (
          <p className="muted">No thesis notes recorded for this position.</p>
        )}

        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={
              'https://finance.yahoo.com/quote/' +
              encodeURIComponent(selected.ticker)
            }
          >
            View market source <ExternalLink size={14} />
          </a>
        </div>
      </aside>
    </div>
  );
}

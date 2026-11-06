'use client';

import { useState, useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ChevronRight,
  Eye,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { money, percent, badge, Spark, HoldingsTable } from './shared';
import { useHoldings, useAnalysis } from './view-data';
import type { ViewProps } from './types';
import { mergeRecommendations } from '../../lib/merge-recommendations';
import { actionPriority, actionLabel } from '../../lib/recommendation-order';
import { cardText } from '../../lib/card-copy';

export default function OverviewView({
  data,
  portfolio,
  navigate,
  setSelected,
}: ViewProps) {
  const holdings = useHoldings(data, portfolio);
  const [chartTicker, setChartTicker] = useState('');
  const [range, setRange] = useState('3M');
  const [search, setSearch] = useState('');

  const analysis = useAnalysis(true).data;
  const priorities = useMemo(
    () =>
      mergeRecommendations(holdings, analysis?.report?.recommendations || [], {
        rulesBased: true,
        fundamentalPolicy: 'investor-v1',
      }).filter((r: any) => actionPriority(r.action) <= 3 && !/^review$/i.test(String(r.action))),
    [holdings, analysis]
  );

  const p = data?.portfolios?.find((p: any) => p.name === portfolio);
  const totals = p || data?.totals;

  const chart =
    holdings.find((h: any) => h.ticker === chartTicker) ||
    // Default to the largest discretionary holding; locked plans (ORCL ESPP) are never acted on.
    holdings.slice().sort((a: any, b: any) => Number(!!a.nonDiscretionary) - Number(!!b.nonDiscretionary) || (b.value || 0) - (a.value || 0))[0];

  const history =
    chart?.quote?.history?.slice(
      -({ '1M': 22, '3M': 66, '6M': 132, '1Y': 366 }[range] || 66)
    ) || [];

  const change =
    history.length > 1
      ? (history.at(-1).close / history[0].close - 1) * 100
      : null;

  const sectorAllocations = useMemo(() => {
    const map = holdings.reduce((a: any, h: any) => {
      a[h.sector] = (a[h.sector] || 0) + (h.value || 0);
      return a;
    }, {});
    return Object.entries(map).sort((a: any, b: any) => (b[1] as number) - (a[1] as number));
  }, [holdings]);

  return (
    <>
      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Market lens <span className="subtle-tag">STOCK PRICE</span>
              </h2>
              <p>Actual price history · not portfolio performance</p>
            </div>
            <select
              aria-label="Chart holding"
              value={chart?.ticker || ''}
              onChange={(e) => setChartTicker(e.target.value)}
            >
              {[...new Set(holdings.map((h: any) => h.ticker))].map((t: any) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="chart-meta">
            <div>
              <strong>{money(chart?.price, chart?.currency)}</strong>
              <span className={(change || 0) >= 0 ? 'positive' : 'negative'}>
                {percent(change)} <small>over {range}</small>
              </span>
            </div>
            <div className="range-buttons">
              {['1M', '3M', '6M', '1Y'].map((r) => (
                <button
                  key={r}
                  className={range === r ? 'selected' : ''}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <Spark
            large
            points={history}
            color={(change || 0) >= 0 ? '#059669' : '#e11d48'}
          />

          <div className="chart-axis">
            <span>{history[0]?.date || '—'}</span>
            <span>
              {chart?.ticker} · {chart?.currency} ·{' '}
              {chart?.quote?.stale ? 'Price needs review' : 'Latest market session'}
            </span>
            <span>{history.at(-1)?.date || '—'}</span>
          </div>
        </section>

        <section className="panel next-moves">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <Sparkles size={13} /> NEEDS ATTENTION
              </span>
              <h2>Top decisions</h2>
            </div>
          </div>

          {priorities.slice(0, 3).map((h: any) => (
            <button
              key={h.portfolio + h.ticker}
              className="move-row"
              onClick={() =>
                setSelected(
                  holdings.find(
                    (x: any) => x.ticker === h.ticker && x.portfolio === h.portfolio
                  ) || h
                )
              }
            >
              <span className={'move-icon ' + badge(h.action)}>
                {actionPriority(h.action) <= 1 ? (
                  <ArrowDownRight size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </span>
              <span>
                <strong>
                  {actionLabel(h.action)} · {h.ticker}
                </strong>
                <small>
                  {cardText(h.reasons?.[0] || 'Review the supporting information')}
                </small>
                <em>{h.portfolio}</em>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}

          {!priorities.length && (
            <div className="quiet-state">
              <ShieldCheck size={28} />
              <p>No supported trade action right now.</p>
              <small>Review evidence gaps in Recommendations.</small>
            </div>
          )}

          <button
            className="full-link"
            onClick={() => navigate('Recommendations')}
          >
            See all recommendations <ArrowRight size={14} />
          </button>
        </section>
      </div>

      <section className="panel holdings-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Your holdings <span className="count">{holdings.length}</span>
            </h2>
            <p>Click a position to explore the evidence.</p>
          </div>
          <div className="table-tools">
            <label className="search">
              <Search size={15} />
              <input
                placeholder="Find a holding…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button className="button" onClick={() => navigate('Holdings')}>
              <SlidersHorizontal size={15} />
              All holdings
            </button>
          </div>
        </div>
        <HoldingsTable
          holdings={holdings}
          setSelected={setSelected}
          search={search}
        />
      </section>

      <div className="bottom-grid">
        <section className="panel allocation-panel">
          <div className="panel-heading">
            <h2>Where your money sits</h2>
            <span className="subtle-tag">SECTOR EXPOSURE</span>
          </div>
          {sectorAllocations.map(([sector, value]: any, i) => (
            <div className="allocation-row" key={sector}>
              <span>
                <i className={'portfolio-dot dot-' + (i % 7)} />
                {sector}
              </span>
              <div>
                <i
                  style={{
                    width: `${Math.min(
                      100,
                      (totals?.value || 0) > 0 ? (value / totals.value) * 100 : 0
                    )}%`,
                  }}
                />
              </div>
              <strong>
                {(totals?.value || 0) > 0
                  ? ((value / totals.value) * 100).toFixed(1)
                  : '—'}
                %
              </strong>
            </div>
          ))}
          <small className="muted">
            Broad sector mapping; review company classification before sector decisions.
          </small>
        </section>

        <section className="panel gate-health">
          <span className="section-kicker">
            <ShieldCheck size={14} /> JARVIS GATE HEALTH
          </span>
          {(() => {
            const companies = [...new Map(holdings.filter((h: any) => !h.nonDiscretionary).map((h: any) => [h.ticker, h])).values()] as any[];
            const scored = companies.filter((h) => h.scorecard?.gates?.length);
            const failing = scored.filter((h) => h.scorecard.gates.some((g: any) => g.status === 'fail'));
            const clean = scored.filter((h) => h.scorecard.status === 'eligible');
            const below = scored.filter((h) => h.scorecard.intrinsic?.value && h.price <= h.scorecard.intrinsic.value);
            return (
              <>
                <h2>{clean.length} of {scored.length || companies.length} companies pass every mandatory check</h2>
                <div className="health-stats">
                  <div><strong>{clean.length}</strong><small>All gates pass</small></div>
                  <div className={failing.length ? 'negative' : ''}><strong>{failing.length}</strong><small>Failing a gate</small></div>
                  <div><strong>{below.length}</strong><small>At or below code value</small></div>
                </div>
                {failing.length > 0 && (
                  <ul className="health-list">
                    {failing.slice(0, 4).map((h) => (
                      <li key={h.ticker}>
                        <button className="text-link" onClick={() => setSelected(h)}>{h.ticker.replace(/\.NS$/, '')}</button>
                        <span>{h.scorecard.gates.filter((g: any) => g.status === 'fail').map((g: any) => g.label).join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button className="text-link" onClick={() => navigate('Framework')}>
                  How the gates work <ArrowRight size={15} />
                </button>
              </>
            );
          })()}
        </section>
      </div>
    </>
  );
}

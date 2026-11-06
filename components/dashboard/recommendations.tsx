'use client';

import { useState, useMemo } from 'react';
import {
  TrendingUp,
  ArrowRight,
  FileText,
  Sparkles,
} from 'lucide-react';
import { money, date, badge, Markdown } from './shared';
import { GateChips, ValueTag } from './scorecard';
import { useHoldings, useDiscovery, useAnalysis } from './view-data';
import type { ViewProps } from './types';
import { mergeRecommendations } from '../../lib/merge-recommendations';
import {
  actionPriority,
  actionLabel,
  priorityOrderLabel,
} from '../../lib/recommendation-order';
import { supportLabel } from '../../lib/card-copy';
import FundamentalResearch from '../fundamental-research';
import RecommendationCopy from '../recommendation-copy';
import InlineTradePlan from '../inline-trade-plan';

export default function RecommendationsView({
  data,
  portfolio,
  setSelected,
  showExecution,
}: ViewProps) {
  const holdings = useHoldings(data, portfolio);
  const [filter, setFilter] = useState('All actions');
  const [market] = useState('India');

  const analysisState = useAnalysis();
  const analysis = analysisState.data;

  const discoveryState = useDiscovery(portfolio);
  const discoveryData = discoveryState.data;

  const cards = useMemo(
    () =>
      mergeRecommendations(
        holdings,
        (analysis?.report?.recommendations || []).filter(
          (r: any) => portfolio === 'All portfolios' || r.portfolio === portfolio
        ),
        {
          rulesBased: true,
          fundamentalPolicy: 'investor-v1',
          ...(discoveryData?.discovery || {}),
        }
      ),
    [holdings, analysis, portfolio, discoveryData]
  );

  const recommendationActions = useMemo(
    () =>
      [...new Set(cards.map((r: any) => actionLabel(r.action)))].sort(
        (a, b) => actionPriority(a) - actionPriority(b) || a.localeCompare(b)
      ),
    [cards]
  );

  const filteredCards = cards.filter(
    (r: any) => filter === 'All actions' || actionLabel(r.action) === filter
  );

  // Inbox grouping: only decisions get full cards; everything else is a scannable table.
  const groups = useMemo(() => {
    const decide: any[] = [], watch: any[] = [], waiting: any[] = [], quiet: any[] = [];
    for (const c of filteredCards) {
      const a = String(c.action || '').toLowerCase();
      if (a === 'hold' || a === 'locked') quiet.push(c);
      else if (a === 'watch') watch.push(c);
      else if (a === 'review') waiting.push(c);
      else decide.push(c);
    }
    return { decide, watch, waiting, quiet };
  }, [filteredCards]);

  const card = (card: any) => (
          <article className="panel recommendation" key={card.id}>
            <div className="rec-top">
              <span className={'badge ' + badge(card.action)}>
                {actionLabel(card.action)}
              </span>
              <GateChips scorecard={card.holding?.scorecard} compact />
            </div>

            <h2>
              {card.ticker}
              {card.price !== null && card.price !== undefined && (
                <span>{money(card.price, card.currency)}</span>
              )}
            </h2>

            <p className="rec-portfolio">
              {card.portfolio} ·{' '}
              {typeof card.weight === 'number'
                ? card.weight.toFixed(1) + '% weight'
                : 'Weight unavailable'}
              {' · '}{supportLabel(card.confidence)}
            </p>

            <RecommendationCopy
              reasons={card.reasons}
              risks={card.risks}
              action={card.copyAction}
            />

            {card.additionalReasons?.length > 0 && (
              <details className="research-risks merged-assessment">
                <summary>{card.additionalLabel}</summary>
                {card.additionalReasons.map((reason: string, i: number) => (
                  <p key={i}>{reason}</p>
                ))}
              </details>
            )}

            <InlineTradePlan
              ticker={card.ticker}
              portfolio={card.portfolio}
              action={card.action}
              revision={(analysis?.report?.updated_at || '') + data?.asOf}
              referencePrice={card.price}
              currency={card.currency}
            />

            <div className="rec-bottom">
              <button
                className="text-link"
                onClick={() =>
                  showExecution(card.ticker, card.portfolio, undefined, !card.nonDiscretionary)
                }
              >
                Full price plan <TrendingUp size={12} />
              </button>
              <button className="text-link" onClick={() => setSelected(card.holding)}>
                Checklist & details <ArrowRight size={13} />
              </button>
            </div>
          </article>
  );

  const table = (rows: any[]) => (
    <div className="table-wrap">
      <table className="compact-table">
        <thead>
          <tr>
            <th>Stock</th>
            <th>Portfolio</th>
            <th className="num">Weight</th>
            <th>Jarvis gates</th>
            <th>Price vs value</th>
            <th>Next step</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c: any) => (
            <tr key={c.id} tabIndex={0} onClick={() => setSelected(c.holding)} onKeyDown={(e) => e.key === 'Enter' && setSelected(c.holding)}>
              <td>
                <strong>{c.ticker.replace(/\.NS$/, '')}</strong>
                <span className={'badge mini ' + badge(c.action)}>{actionLabel(c.action)}</span>
              </td>
              <td className="muted">{c.portfolio}</td>
              <td className="num">{typeof c.weight === 'number' ? c.weight.toFixed(1) + '%' : '—'}</td>
              <td><GateChips scorecard={c.holding?.scorecard} compact /></td>
              <td><ValueTag price={c.price} scorecard={c.holding?.scorecard} /></td>
              <td className="next-step">{c.reasons?.[0] || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="inbox-summary">
        <div className="inbox-counts">
          <span className="count-pill count-decide"><strong>{groups.decide.length}</strong> to decide</span>
          <span className="count-pill count-watch"><strong>{groups.watch.length}</strong> to watch</span>
          <span className="count-pill"><strong>{groups.waiting.length}</strong> waiting for research or price</span>
          <span className="count-pill"><strong>{groups.quiet.length}</strong> no action</span>
        </div>
        <select
          aria-label="Filter recommendation action"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All actions</option>
          {recommendationActions.map((a: string) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      <section className="inbox-section">
        <h2 className="section-heading">Decisions <span className="count">{groups.decide.length}</span></h2>
        <p className="section-sub">{priorityOrderLabel}. Each card shows the Jarvis gates, the reason and the price plan.</p>
        {groups.decide.length ? (
          <div className="recommendation-grid">{groups.decide.map(card)}</div>
        ) : (
          <div className="empty-state">Nothing needs a decision right now: no concentration breach above 17%, no serious red flag and no over-extended profit trim.</div>
        )}
      </section>

      {groups.watch.length > 0 && (
        <section className="inbox-section">
          <h2 className="section-heading">Watch <span className="count">{groups.watch.length}</span></h2>
          <p className="section-sub">A mandatory check fails. No additions; check whether the reason for owning the company still holds.</p>
          <div className="recommendation-grid">{groups.watch.map(card)}</div>
        </section>
      )}

      {groups.waiting.length > 0 && (
        <section className="inbox-section">
          <h2 className="section-heading">Waiting for research or price <span className="count">{groups.waiting.length}</span></h2>
          <p className="section-sub">The financial gates pass. Adding still needs a current company review, a margin of safety and a sign of technical support.</p>
          {table(groups.waiting)}
        </section>
      )}

      {groups.quiet.length > 0 && (
        <details className="inbox-section quiet">
          <summary className="section-heading">No action <span className="count">{groups.quiet.length}</span></summary>
          {table(groups.quiet)}
        </details>
      )}

      <div className="footnote">
        Financial and portfolio rules determine trades. AI adds context; check the current event and price plan before ordering. No trades are placed here.
      </div>

      {/* 3. SECONDARY SUPPORTING EVIDENCE (Collapsible) */}
      <div style={{ marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <details className="panel">
          <summary style={{ padding: '16px 20px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} /> Latest AI portfolio briefing
          </summary>
          <div style={{ padding: '0 20px 20px' }}>
            {analysisState.error && (
              <div className="alert error">
                {analysisState.error}
                <button onClick={analysisState.refresh}>Retry</button>
              </div>
            )}
            {analysis?.report?.body ? (
              <>
                <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', margin: '12px 0' }}>
                  Completed {date(analysis.report.updated_at)} · {analysis.report.model}
                </p>
                <div className="full-briefing">
                  <Markdown text={analysis.report.body} />
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', margin: '12px 0' }}>
                No completed portfolio research briefing is available yet. Current portfolio checks are shown above.
              </p>
            )}
          </div>
        </details>

        <details className="panel">
          <summary style={{ padding: '16px 20px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} /> Company investment cases & valuation references
          </summary>
          <div style={{ padding: '0 20px 20px' }}>
            <FundamentalResearch
              discovery={discoveryData?.discovery}
              holdings={data?.holdings || []}
              portfolio={portfolio}
              market={market}
            />
          </div>
        </details>
      </div>
    </>
  );
}

'use client';

import { GateChips, ValueTag, ImpliedGrowth } from './scorecard';
import { useState, useMemo, useEffect } from 'react';
import {
  Wallet,
  Search,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { money, percent, date } from './shared';
import { useDiscovery } from './view-data';
import type { ViewProps } from './types';
import InvestmentDecision from '../investment-decision';
import CashResearchQueue from '../cash-research-queue';
import PurchaseCard from '../purchase-card';
import DiscoveryCoverage from '../discovery-coverage';
import InlineTradePlan from '../inline-trade-plan';
import { allocationExplanations } from '../../lib/allocation-explanations';
import { planDiscovery } from '../../lib/discovery';
import { candidateReview, discoveryCoverage } from '../../lib/discovery-review';
import QueueResearchButton from '../research/queue-button';
import { discoveryPriority } from '../../lib/recommendation-order';

export default function DeployView({
  data,
  portfolio,
  showExecution,
}: ViewProps) {
  const [budget, setBudget] = useState('');
  const [market, setMarket] = useState('India');
  const [shownCandidates, setShownCandidates] = useState<Record<string, number>>({
    eligible: 12,
    watchlist: 12,
    rejected: 12,
  });
  const [shownBlockers, setShownBlockers] = useState(30);

  const discoveryState = useDiscovery(portfolio);
  const discoveryData = discoveryState.data;
  const discoveryError = discoveryState.error;

  const portfolios = data?.portfolios || [];
  const p = portfolios.find((x: any) => x.name === portfolio);

  useEffect(() => {
    setShownCandidates({ eligible: 12, watchlist: 12, rejected: 12 });
    setShownBlockers(30);
    setBudget('');
  }, [market, portfolio]);

  const setPortfolio = (name: string) => {
    window.dispatchEvent(
      new CustomEvent('arthapalana-portfolio', { detail: name })
    );
  };

  const plan: any = useMemo(
    () =>
      p
        ? planDiscovery(
            p,
            data?.holdings || [],
            budget === '' ? Math.max(0, p.cash) : Number(budget),
            market,
            {
              ...(discoveryData?.discovery || {}),
              rulesBased: true,
              fundamentalPolicy: 'investor-v1',
              combinedTotal: data?.totals?.value,
              holdingRecommendations: discoveryData?.holdingRecommendations || [],
              reportAsOf: discoveryData?.reportAsOf,
            },
            discoveryData?.ideas || []
          )
        : null,
    [p, data, budget, market, discoveryData]
  );

  const allocationBlocks = useMemo(
    () =>
      plan && p
        ? allocationExplanations(
            p,
            (data?.holdings || []).filter(
              (h: any) => h.currency === (market === 'India' ? 'INR' : 'USD')
            ),
            market,
            discoveryData?.discovery
              ? {
                  ...discoveryData.discovery,
                  candidates: discoveryData.discovery.candidates.filter(
                    (c: any) => c.market === (market === 'India' ? 'IN' : 'US')
                  ),
                }
              : null,
            discoveryData?.ideas || [],
            plan
          ).sort(
            (a: any, b: any) =>
              a.kind.localeCompare(b.kind) || a.ticker.localeCompare(b.ticker)
          )
        : [],
    [plan, p, data, market, discoveryData]
  );

  const discoveryCandidates = useMemo(
    () =>
      (discoveryData?.discovery?.candidates || [])
        .filter((c: any) => c.market === (market === 'India' ? 'IN' : 'US'))
        .sort((a: any, b: any) => {
          const rank = (c: any) =>
            discoveryPriority(
              c,
              (discoveryData?.ideas || []).find(
                (i: any) => i.ticker === c.ticker && i.portfolio === portfolio
              )?.decision
            );
          return rank(a) - rank(b) || a.ticker.localeCompare(b.ticker);
        }),
    [discoveryData, market, portfolio]
  );

  const ideaFor = (ticker: string) =>
    (discoveryData?.ideas || []).find(
      (i: any) => i.ticker === ticker && i.portfolio === portfolio
    );

  const buyCoverage = discoveryCoverage(
    discoveryCandidates,
    portfolio,
    discoveryData?.ideas || [],
    plan?.allocations || []
  );

  const entryWatchCount = discoveryCandidates.filter(
    (c: any) => ideaFor(c.ticker)?.fundamentalStatus === 'valuation'
  ).length;

  return (
    <>
      {/* 1. Cash Allocation Form */}
      <section className="panel deployment-form">
        <div>
          <span className="section-kicker">
            <Wallet size={13} /> CASH ALLOCATION
          </span>
          <h2>Build a measured deployment plan</h2>
          <p>
            Choose a portfolio and budget. Build investment cases, compare entry prices and see the shares proposed for purchase.
          </p>
        </div>
        <div className="form-row">
          <label>
            Portfolio
            <select
              value={portfolio}
              onChange={(e) => {
                setPortfolio(e.target.value);
                setBudget('');
              }}
            >
              <option value="All portfolios">Choose a portfolio</option>
              {portfolios.map((p: any) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Market
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option>India</option>
              <option>US</option>
            </select>
          </label>
          <label>
            Budget in INR
            <input
              type="number"
              min="0"
              max={Math.max(0, p?.cash || 0)}
              placeholder={p ? Math.max(0, p.cash).toFixed(2) : 'Choose portfolio'}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* 2. Allocation Plan Results */}
      {plan ? (
        <section className="panel deployment-result">
          <div className="panel-heading">
            <h2>
              {plan.allocations.length
                ? 'Proposed purchases'
                : entryWatchCount
                ? 'Waiting for better entry prices'
                : buyCoverage.pending
                ? 'Your cash plan is awaiting investment research'
                : 'No qualifying buys at current prices'}
            </h2>
            <span className="badge green">BUY-ONLY PLAN</span>
          </div>

          <div className="plan-totals">
            <div>
              <small>Available budget</small>
              <strong>{money(plan.budget)}</strong>
            </div>
            <div>
              <small>Cash assigned to this plan</small>
              <strong>{money(plan.budget - plan.reserve)}</strong>
            </div>
            <div>
              <small>Cash kept in reserve</small>
              <strong>{money(plan.reserve)}</strong>
            </div>
          </div>

          <div className="buy-coverage">
            <span>
              <b>{buyCoverage.eligible}</b> screen-eligible
            </span>
            <span>
              <b>{buyCoverage.reviewed}</b> investment decisions completed
            </span>
            <span>
              <b>{buyCoverage.pending}</b> awaiting investment research
            </span>
            <span>
              <b>{buyCoverage.approved}</b> ready for allocation
            </span>
            <span>
              <b>{buyCoverage.sized}</b> new entries sized
            </span>
          </div>

          <p>
            {plan.allocations.length
              ? 'These stocks have a supported investment case and pass the financial, valuation, event and budget checks. Each price plan below shows whether a purchase is actionable; closed markets or failed technical checks keep it conditional.'
              : entryWatchCount
              ? `${entryWatchCount} researched companies have supported investment cases, but current prices are above their buy ceilings. Their entry targets are shown below. ${buyCoverage.pending} other candidates await investment research.`
              : buyCoverage.pending
              ? `${buyCoverage.pending} screen-passing candidates still need a completed investment decision. This is unfinished research, not a finding that no suitable investment exists.`
              : `The assessed stocks do not currently meet the investment, entry-price or portfolio requirements. See the specific reasons below.`}
          </p>

          {plan.allocations.map((a: any) => (
            <PurchaseCard
              key={a.ticker}
              allocation={a}
              portfolio={p}
              holdings={data?.holdings || []}
              discovery={discoveryData?.discovery}
              budget={String(plan.budget)}
              revision={data?.asOf + ':' + discoveryData?.discovery?.asOf}
            />
          ))}

          {discoveryData?.discovery && (
            <CashResearchQueue
              data={data}
              discovery={discoveryData.discovery}
              portfolio={p}
              market={market}
              budget={plan.budget}
              onPrice={(ticker) =>
                showExecution(ticker, p.name, String(plan.budget))
              }
            />
          )}

          <details className="allocation-blockers">
            <summary>
              {plan.allocations.length
                ? 'Why other stocks are not ready'
                : 'Why purchases are not ready'}{' '}
              <span className="count">{allocationBlocks.length}</span>
            </summary>
            <p>
              For {p.name} · {market}. Each stock lists the financial, event, cash or exposure checks that are missing or have failed.
            </p>
            {!discoveryData?.discovery && (
              <div className="alert">
                Independent new-stock screening is not available yet. Use Refresh market checks to request it without an AI run.
              </div>
            )}
            {allocationBlocks.slice(0, shownBlockers).map((row: any) => (
              <article
                className="allocation-blocker"
                key={row.kind + row.ticker}
              >
                <div>
                  <strong>{row.ticker}</strong>
                  <span>{row.kind}</span>
                  {row.label && <span className="badge gray">{row.label}</span>}
                </div>
                <ul>
                  {row.reasons.map((reason: string, i: number) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </article>
            ))}
            {allocationBlocks.length > shownBlockers && (
              <button
                className="button show-more"
                onClick={() => setShownBlockers(shownBlockers + 30)}
              >
                Show 30 more stock explanations · {shownBlockers} of{' '}
                {allocationBlocks.length} shown
              </button>
            )}
            {!allocationBlocks.length && (
              <p>No excluded stocks in the current assessment.</p>
            )}
          </details>

          <div className="footnote">
            Whole shares in India · four decimal places in the US · new entries: 3% minimum at low conviction, 5% otherwise · 15% position cap · household exposure checked · no automatic orders. Entries require a current, source-backed company review, suitable valuation, eligible financial screen, current event coverage and a valid technical setup. Prices are refreshed separately from research.
          </div>
        </section>
      ) : (
        <div className="empty panel" style={{ padding: '40px 24px', textAlign: 'center' }}>
          Select a portfolio to calculate a cash plan.
        </div>
      )}

      {/* 3. New-Stock Discovery Workbench */}
      <section className="panel discovery-panel" style={{ marginTop: '32px' }}>
        <div className="panel-heading">
          <div>
            <span className="section-kicker">
              <Search size={13} /> NEW-STOCK DISCOVERY
            </span>
            <h2>Find the next meaningful position</h2>
            <p>
              Jarvis financial screens ·{' '}
              {market === 'India' ? 'NSE' : 'Nasdaq / NYSE / NYSE American'} · rules-based allocation
            </p>
          </div>
          <QueueResearchButton />
        </div>

        {discoveryError && <div className="alert error">{discoveryError}</div>}

        {discoveryData?.discovery ? (
          <>
            <div className="discovery-meta">
              <span>Screened {date(discoveryData.discovery.asOf)}</span>
              <span>
                {discoveryData.discovery.screens.length} sub-screens ·{' '}
                {discoveryCandidates.length} evaluated stocks loaded in this market
              </span>
            </div>

            <details className="coverage-details">
              <summary>Screening coverage and data sources</summary>
            <DiscoveryCoverage
              discovery={discoveryData.discovery}
              market={market}
            />
            </details>

            <p className="discovery-scope">
              {discoveryData.discovery.scope}. Select a portfolio to see its cash plan. Seven Jarvis gates are mandatory; warnings only reduce the position size.
            </p>

            {discoveryData.discovery.errors.length > 0 && (
              <details className="data-warnings">
                <summary>
                  <AlertTriangle size={14} />
                  {discoveryData.discovery.errors.length} screening feed warnings
                </summary>
                <ul>
                  {discoveryData.discovery.errors.map((e: string, i: number) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}

            {['eligible', 'watchlist', 'rejected'].map((status) => (
              <section className="discovery-group" key={status}>
                <h3>
                  {status === 'eligible'
                    ? 'Eligible'
                    : status === 'watchlist'
                    ? 'Watchlist'
                    : 'Rejected'}{' '}
                  <span className="count">
                    {
                      discoveryCandidates.filter((c: any) => c.status === status)
                        .length
                    }
                  </span>
                </h3>
                <p>
                  {status === 'eligible'
                    ? 'Passed the primary financial screen. Accounting, valuation and current trade checks decide whether a buy can be proposed; a screening pass alone is not approval.'
                    : status === 'watchlist'
                    ? 'Further checks are needed before these stocks can qualify.'
                    : 'These stocks failed a screening check.'}
                </p>
                <div className="discovery-grid">
                  {discoveryCandidates
                    .filter((c: any) => c.status === status)
                    .slice(0, shownCandidates[status])
                    .map((c: any) => {
                      const idea = ideaFor(c.ticker);
                      const review = candidateReview(
                        c,
                        portfolio,
                        discoveryData.ideas
                      );
                      return (
                        <article className="discovery-card" key={c.ticker}>
                          <div className="rec-top">
                            <span
                              className={
                                'badge ' +
                                (c.status === 'eligible'
                                  ? 'green'
                                  : c.status === 'rejected'
                                  ? 'amber'
                                  : 'violet')
                              }
                            >
                              {c.status === 'eligible'
                                ? 'Gates pass'
                                : c.status === 'rejected'
                                ? 'Fails a gate'
                                : 'Watchlist'}
                            </span>
                            <small>
                              Category {c.category} · {c.sector}
                            </small>
                          </div>
                          <h3>
                            {c.ticker}
                            <span>{money(c.price, c.currency)}</span>
                          </h3>
                          <p className="candidate-name">{c.name}</p>
                          <GateChips scorecard={c.scorecard} />
                          <div className="candidate-metrics">
                            <span>
                              {c.scorecard?.metrics?.cagrYears ? `Revenue ${c.scorecard.metrics.cagrYears}y` : 'Revenue'}{' '}
                              <strong>
                                {percent(c.scorecard?.metrics?.revenueCagr ?? c.metrics.revenue_growth_yoy)}
                              </strong>
                            </span>
                            <span>
                              {c.sector === 'Financials' ? 'Median ROE' : 'Median ROCE'}{' '}
                              <strong>
                                {percent(c.sector === 'Financials' ? c.scorecard?.metrics?.roeMedian ?? c.metrics.roe : c.scorecard?.metrics?.roceMedian ?? c.metrics.roce)}
                              </strong>
                            </span>
                            <span>
                              Price vs value <ValueTag price={c.price} scorecard={c.scorecard} />
                            </span>
                            <span>
                              Reverse DCF <ImpliedGrowth reverse={c.scorecard?.reverseDcf} />
                            </span>
                          </div>
                          {c.status === 'eligible' ? (
                            <InvestmentDecision
                              discovery={discoveryData.discovery}
                              ticker={c.ticker}
                              price={c.price}
                              period={c.metrics?.statementDate}
                              portfolioReason={
                                idea?.decision === 'enter'
                                  ? undefined
                                  : review.reasons[0]
                              }
                            />
                          ) : (
                            <>
                              <p className="candidate-decision">
                                <strong>{review.label}</strong>
                              </p>
                              <ul>
                                {review.reasons.slice(0, 3).map((reason: string) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          <details className="research-risks">
                            <summary>Screen criteria & evidence</summary>
                            {c.matchedScreens.map((m: any, i: number) => (
                              <p key={i}>
                                <strong>{m.bucket}:</strong> {m.criteria}
                              </p>
                            ))}
                            {c.gateReasons.map((r: string, i: number) => (
                              <p key={i}>{r}</p>
                            ))}
                            {c.evidenceGaps.map((r: string, i: number) => (
                              <p key={i}>{r}</p>
                            ))}
                          </details>
                          <InlineTradePlan
                            ticker={c.ticker}
                            portfolio={
                              portfolio === 'All portfolios'
                                ? undefined
                                : portfolio
                            }
                            action={
                              c.status === 'eligible' &&
                              idea?.decision === 'enter'
                                ? 'buy'
                                : 'watch'
                            }
                            budget={budget}
                            revision={discoveryData.reportAsOf}
                            referencePrice={c.price}
                            currency={c.currency}
                            reason={
                              review.state === 'enter'
                                ? undefined
                                : review.reasons[0]
                            }
                            pending={review.state === 'pending'}
                            buyReview
                          />
                          <div className="candidate-source">
                            <button
                              className="text-link"
                              onClick={() =>
                                showExecution(
                                  c.ticker,
                                  portfolio === 'All portfolios'
                                    ? undefined
                                    : portfolio,
                                  budget
                                )
                              }
                            >
                              See price & shares <TrendingUp size={12} />
                            </button>
                            <small className={c.stale ? 'warn' : ''}>
                              {c.stale ? 'Stale · ' : ''}
                              {date(c.quoteTime)}
                            </small>
                            <a
                              className="text-link"
                              target="_blank"
                              rel="noreferrer"
                              href={c.sourceUrl}
                            >
                              Market source <ExternalLink size={11} />
                            </a>
                          </div>
                        </article>
                      );
                    })}
                </div>
                {discoveryCandidates.filter((c: any) => c.status === status)
                  .length > shownCandidates[status] && (
                  <button
                    className="button show-more"
                    onClick={() =>
                      setShownCandidates({
                        ...shownCandidates,
                        [status]: shownCandidates[status] + 24,
                      })
                    }
                  >
                    Show 24 more {status} stocks ·{' '}
                    {Math.min(
                      shownCandidates[status],
                      discoveryCandidates.filter((c: any) => c.status === status)
                        .length
                    )}{' '}
                    of{' '}
                    {
                      discoveryCandidates.filter((c: any) => c.status === status)
                        .length
                    }{' '}
                    shown
                  </button>
                )}
              </section>
            ))}
            {!discoveryCandidates.length && (
              <div className="empty">
                No candidates returned for this market. Keep cash reserved;
                screening failures are not treated as an empty investment
                universe.
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            Use Refresh market checks to screen stocks and update event coverage.
            Existing holdings remain available while checks run.
          </div>
        )}
      </section>
    </>
  );
}

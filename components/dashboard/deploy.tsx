'use client';

import { Fragment, useState, useMemo, useEffect } from 'react';
import { Search, ExternalLink, AlertTriangle, TrendingUp, ChevronRight, ArrowDown, ArrowUp } from 'lucide-react';
import { ImpliedGrowth } from './scorecard';
import { ReportEvidence } from '../report-evidence';
import { date } from './shared';
import { useDiscovery } from './view-data';
import type { ViewProps } from './types';
import InvestmentDecision from '../investment-decision';
import CashResearchQueue from '../cash-research-queue';
import PurchaseCard from '../purchase-card';
import DiscoveryCoverage from '../discovery-coverage';
import InlineTradePlan from '../inline-trade-plan';
import { allocationExplanations } from '../../lib/allocation-explanations';
import { planDiscovery } from '../../lib/discovery';
import {shortlistCheck} from '../../lib/fundamental-policy';
import {cagrText} from '../return-potential';
import { candidateReview, discoveryCoverage } from '../../lib/discovery-review';
import QueueResearchButton from '../research/queue-button';
import { discoveryPriority } from '../../lib/recommendation-order';
import { Panel, GateGlyphs, ValuePct, Segmented, Empty } from '../terminal/ui';
import { inr, px, pct, symbol } from '../terminal/format';
import { cn } from '@/lib/utils';

type Status = 'shortlist' | 'eligible' | 'watchlist' | 'rejected' | 'reviewed';
type SortKey = 'priority' | 'value' | 'roce' | 'growth' | 'implied' | 'cagr3' | 'cagr5' | 'ticker';
const PAGE = 50;

const field = 'h-8 rounded-md border border-line bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const label = 'grid gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground';

export default function DeployView({ data, portfolio, showExecution }: ViewProps) {
  const [budget, setBudget] = useState('');
  const [market, setMarket] = useState('India');
  const [status, setStatus] = useState<Status>('shortlist');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'priority', desc: false });
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [shownBlockers, setShownBlockers] = useState(30);

  const discoveryState = useDiscovery(portfolio);
  const discoveryData = discoveryState.data;
  const discovery = discoveryData?.discovery;
  const portfolios = data?.portfolios || [];
  const p = portfolios.find((x: any) => x.name === portfolio);

  useEffect(() => {
    setShown(PAGE);
    setShownBlockers(30);
    setBudget('');
    setOpen(null);
  }, [market, portfolio]);
  useEffect(() => {
    setShown(PAGE);
    setOpen(null);
  }, [status, search, sort]);

  const setPortfolio = (name: string) => window.dispatchEvent(new CustomEvent('arthapalana-portfolio', { detail: name }));

  const plan: any = useMemo(
    () =>
      p
        ? planDiscovery(
            p,
            data?.holdings || [],
            budget === '' ? Math.max(0, p.cash) : Number(budget),
            market,
            {
              ...(discovery || {}),
              rulesBased: true,
              fundamentalPolicy: 'investor-v1',
              combinedTotal: data?.totals?.value,
              holdingRecommendations: discoveryData?.holdingRecommendations || [],
              reportAsOf: discoveryData?.reportAsOf,
            },
            discoveryData?.ideas || [],
          )
        : null,
    [p, data, budget, market, discoveryData, discovery],
  );

  const allocationBlocks = useMemo(
    () =>
      plan && p
        ? allocationExplanations(
            p,
            (data?.holdings || []).filter((h: any) => h.currency === (market === 'India' ? 'INR' : 'USD')),
            market,
            discovery ? { ...discovery, candidates: discovery.candidates.filter((c: any) => c.market === (market === 'India' ? 'IN' : 'US')) } : null,
            discoveryData?.ideas || [],
            plan,
          ).sort((a: any, b: any) => a.kind.localeCompare(b.kind) || a.ticker.localeCompare(b.ticker))
        : [],
    [plan, p, data, market, discoveryData, discovery],
  );

  const ideaFor = (ticker: string) => (discoveryData?.ideas || []).find((i: any) => i.ticker === ticker && i.portfolio === portfolio);
  const candidates = useMemo(
    () =>
      (discovery?.candidates || [])
        .filter((c: any) => c.market === (market === 'India' ? 'IN' : 'US'))
        .map((c: any) => {const {potential,qualified}=shortlistCheck(discovery,c);return ({
          ...c,_return:potential,_shortlisted:qualified,
          _rank: discoveryPriority(c, (discoveryData?.ideas || []).find((i: any) => i.ticker === c.ticker && i.portfolio === portfolio)?.decision),
          _value: c.scorecard?.intrinsic?.value ? c.price / c.scorecard.intrinsic.value : null,
          _roce: c.scorecard?.businessModel?.lender ? (c.scorecard?.metrics?.roeMedian ?? c.metrics?.roe) : (c.scorecard?.metrics?.roceMedian ?? c.metrics?.roce),
          _growth: c.scorecard?.metrics?.revenueCagr ?? c.metrics?.revenue_growth_yoy,
          _implied: c.scorecard?.reverseDcf?.impliedGrowthPct,
        })}),
    [discovery, discoveryData, market, portfolio],
  );
  const counts = useMemo(() => {
    const n: Record<Status, number> = { shortlist:0,eligible: 0, watchlist: 0, rejected: 0, reviewed: 0 };
    for (const c of candidates) {n[c.status as Status] = (n[c.status as Status] || 0) + 1;if(c._shortlisted)n.shortlist++;if(discovery?.fundamentalReviews?.[c.ticker])n.reviewed++;}
    return n;
  }, [candidates]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = candidates.filter((c: any) => (status==='shortlist'?c._shortlisted:status==='reviewed'?!!discovery?.fundamentalReviews?.[c.ticker]:c.status === status) && (!q || `${c.ticker} ${c.name} ${c.sector}`.toLowerCase().includes(q)));
    const val = (c: any) => ({ priority: c._rank, value: c._value, roce: c._roce, growth: c._growth, implied: c._implied,cagr3:c._return?.scenarios?.[0]?.cagr,cagr5:c._return?.scenarios?.[1]?.cagr, ticker: c.ticker })[sort.key];
    return list.sort((a: any, b: any) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return a.ticker.localeCompare(b.ticker);
      if (x == null) return 1;
      if (y == null) return -1;
      const d = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return (sort.desc ? -d : d) || a.ticker.localeCompare(b.ticker);
    });
  }, [candidates, status, search, sort]);

  const buyCoverage = discoveryCoverage(candidates, portfolio, discoveryData?.ideas || [], plan?.allocations || []);
  const entryWatchCount = candidates.filter((c: any) => ideaFor(c.ticker)?.fundamentalStatus === 'valuation' || ideaFor(c.ticker)?.fundamentalStatus === 'return').length;
  const head = (key: SortKey, text: string, cls = '') => (
    <th className={cn('px-2 font-semibold', cls)}>
      <button
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'value' && key !== 'implied' && key !== 'ticker' }))}
        className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', sort.key === key && 'text-foreground')}
      >
        {text}
        {sort.key === key && (sort.desc ? <ArrowDown className="size-3 text-brand" /> : <ArrowUp className="size-3 text-brand" />)}
      </button>
    </th>
  );

  return (
    <div className="grid gap-3">
      {/* Cash plan */}
      <Panel title="Cash plan" meta={p ? `${p.name} · ${market}` : undefined} flush>
        <div className="grid gap-3 border-b border-line p-3 sm:grid-cols-3">
          <label className={label}>
            Portfolio
            <select
              value={portfolio}
              onChange={(e) => {
                setPortfolio(e.target.value);
                setBudget('');
              }}
              className={field}
            >
              <option value="All portfolios">Choose a portfolio</option>
              {portfolios.map((x: any) => (
                <option key={x.name}>{x.name}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Market
            <select value={market} onChange={(e) => setMarket(e.target.value)} className={field}>
              <option>India</option>
              <option>US</option>
            </select>
          </label>
          <label className={label}>
            Budget (INR)
            <input
              type="number"
              min="0"
              max={Math.max(0, p?.cash || 0)}
              placeholder={p ? Math.max(0, p.cash).toFixed(0) : 'Choose a portfolio'}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={cn(field, 'font-mono')}
            />
          </label>
        </div>

        {!plan ? (
          <Empty>Choose a portfolio to calculate its cash plan.</Empty>
        ) : (
          <div className="grid gap-3 p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold">
                {plan.allocations.length
                  ? 'Proposed purchases'
                  : entryWatchCount
                    ? 'Waiting for better entry prices'
                    : buyCoverage.pending
                      ? 'Awaiting investment research'
                      : 'No qualifying buys at current prices'}
              </h3>
              <span className="rounded-sm border border-gain/30 bg-gain-soft px-1.5 text-[11px] font-semibold text-gain">BUY-ONLY</span>
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-8 [&>div]:bg-panel [&>div]:px-3 [&>div]:py-2">
              {(
                [
                  ['Budget', inr(plan.budget), 'sm:col-span-1'],
                  ['Assigned', inr(plan.budget - plan.reserve), ''],
                  ['Reserve', inr(plan.reserve), ''],
                  ['Screened', buyCoverage.eligible, ''],
                  ['Reviewed', buyCoverage.reviewed, ''],
                  ['Awaiting research', buyCoverage.pending, ''],
                  ['Approved', buyCoverage.approved, ''],
                  ['Sized', buyCoverage.sized, ''],
                ] as any[]
              ).map(([k, v]) => (
                <div key={k}>
                  <div className="truncate text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</div>
                  <div className="font-mono text-sm font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {plan.allocations.length
                ? 'These stocks have a supported investment case and pass the financial, valuation, event and budget checks. Each price plan shows whether a purchase is actionable; closed markets or failed technical checks keep it conditional.'
                : entryWatchCount
                  ? `${entryWatchCount} researched companies have supported cases, but prices are above their buy ceilings. ${buyCoverage.pending} other candidates await research.`
                  : buyCoverage.pending
                    ? `${buyCoverage.pending} screen-passing candidates still need a completed investment decision. This is unfinished research, not a finding that nothing suitable exists.`
                    : 'The assessed stocks do not meet the investment, entry-price or portfolio requirements. Reasons are listed below.'}
            </p>

            {plan.allocations.length > 0 && (
              <div className="grid gap-3">
                {plan.allocations.map((a: any) => (
                  <PurchaseCard key={a.ticker} allocation={a} portfolio={p} holdings={data?.holdings || []} discovery={discovery} budget={String(plan.budget)} revision={data?.asOf + ':' + discovery?.asOf} />
                ))}
              </div>
            )}
            {discovery && (
              <div>
                <CashResearchQueue data={data} discovery={discovery} portfolio={p} market={market} budget={plan.budget} onPrice={(ticker) => showExecution(ticker, p.name, String(plan.budget))} />
              </div>
            )}

            <details className="group rounded-md border border-line">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium">
                <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                {plan.allocations.length ? 'Why other stocks are not ready' : 'Why purchases are not ready'}
                <span className="font-mono text-muted-foreground">{allocationBlocks.length}</span>
              </summary>
              <div className="border-t border-line">
                {!discovery && <p className="px-3 py-2 text-xs text-warn">Independent screening is not available yet.</p>}
                <ul className="divide-y divide-line">
                  {allocationBlocks.slice(0, shownBlockers).map((row: any) => (
                    <li key={row.kind + row.ticker} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[160px_minmax(0,1fr)]">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-semibold">{symbol(row.ticker)}</span>
                        <span className="text-muted-foreground">{row.kind}</span>
                        {row.label && <span className="rounded-sm border border-line px-1 text-[10px] text-muted-foreground">{row.label}</span>}
                      </span>
                      <ul className="grid gap-0.5 text-muted-foreground">
                        {row.reasons.map((r: string, i: number) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {allocationBlocks.length > shownBlockers && (
                  <button onClick={() => setShownBlockers(shownBlockers + 30)} className="w-full border-t border-line py-2 text-xs text-brand hover:bg-hover">
                    Show 30 more · {shownBlockers} of {allocationBlocks.length}
                  </button>
                )}
                {!allocationBlocks.length && <p className="px-3 py-2 text-xs text-muted-foreground">No excluded stocks in the current assessment.</p>}
              </div>
            </details>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Whole shares in India · four decimals in the US · new entries 3% minimum at low conviction, 5% otherwise · 15% position cap · household exposure checked · no automatic orders.
            </p>
          </div>
        )}
      </Panel>

      {/* Screener */}
      <Panel
        title="Screener"
        meta={discovery ? `${market === 'India' ? 'NSE' : 'US'} · screened ${date(discovery.asOf)} · ${discovery.screens.length} screens` : undefined}
        flush
        actions={
          <span >
            <QueueResearchButton />
          </span>
        }
      >
        {discoveryState.error && <p className="border-b border-line px-3 py-2 text-xs text-loss">{discoveryState.error}</p>}
        {!discovery ? (
          <Empty>Use Refresh market checks to screen stocks and update event coverage.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <Segmented
                value={status}
                onChange={setStatus}
                options={[
                  { value:'shortlist',label:'≥15% shortlist',count:counts.shortlist },
                  { value: 'eligible', label: 'Financial screen', count: counts.eligible },
                  { value: 'reviewed', label: 'Reviewed', count: counts.reviewed },
                  { value: 'watchlist', label: 'Watchlist', count: counts.watchlist },
                  { value: 'rejected', label: 'Fails a gate', count: counts.rejected },
                ]}
              />
              <label className="relative ml-auto">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticker, name, sector…" className="h-7 w-52 rounded-md border border-line bg-background pr-2 pl-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
            </div>
            <p className="border-b border-line px-3 py-2 text-xs text-muted-foreground">The shortlist requires a supported company case and at least 15% projected price CAGR over five years. Three years is comparison only. Dividends are excluded; estimates are scenarios, not guarantees. The Financial screen and Reviewed tabs retain companies outside the shortlist.</p>
            {discovery.errors.length > 0 && (
              <details className="border-b border-line px-3 py-2 text-xs text-warn">
                <summary className="flex cursor-pointer items-center gap-1.5">
                  <AlertTriangle className="size-3.5" /> {discovery.errors.length} screening feed warnings
                </summary>
                <ul className="mt-1 list-disc pl-5">
                  {discovery.errors.map((e: string, i: number) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="h-8 border-b border-line bg-raised text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="w-6" />
                    {head('ticker', 'Stock', 'pl-1')}
                    <th className="hidden px-2 font-semibold lg:table-cell">Sector</th>
                    <th className="hidden px-2 font-semibold sm:table-cell">Gates</th>
                    {head('growth', 'Rev CAGR', 'text-right hidden md:table-cell')}
                    {head('roce', 'ROCE/ROE', 'text-right hidden md:table-cell')}
                    {head('value', 'P / Value', 'text-right')}
                    {head('implied', 'Implied g', 'text-right hidden xl:table-cell')}
                    {head('cagr3','3y price CAGR','text-right hidden md:table-cell')}
                    {head('cagr5','5y price CAGR','text-right')}
                    <th className="hidden px-2 font-semibold xl:table-cell">Status</th>
                    <th className="px-3 text-right font-semibold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((c: any) => {
                    const review = candidateReview(c, portfolio, discoveryData.ideas);
                    const idea = ideaFor(c.ticker);
                    const isOpen = open === c.ticker;
                    return (
                      <Fragment key={c.ticker}>
                        <tr
                          tabIndex={0}
                          onClick={() => setOpen(isOpen ? null : c.ticker)}
                          onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : c.ticker)}
                          aria-expanded={isOpen}
                          className={cn('h-9 cursor-pointer border-b border-line/70 hover:bg-hover', isOpen && 'bg-hover')}
                        >
                          <td className="pl-2">
                            <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                          </td>
                          <td className="max-w-[16rem] py-1 pl-1">
                            <div className="font-mono font-semibold">{symbol(c.ticker)}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{c.name}</div>{c.screenRefreshPending&&<span className="text-[11px] text-warn">Financial recheck pending</span>}
                          </td>
                          <td className="hidden px-2 text-xs text-muted-foreground lg:table-cell">
                            {c.sector} <span className="font-mono">· {c.category}</span>
                          </td>
                          <td className="hidden px-2 sm:table-cell">
                            <GateGlyphs scorecard={c.scorecard} />
                          </td>
                          <td className="hidden px-2 text-right font-mono tabular-nums md:table-cell">{pct(c._growth)}</td>
                          <td className="hidden px-2 text-right font-mono tabular-nums md:table-cell">{pct(c._roce, { signed: false })}</td>
                          <td className="px-2 text-right">
                            <ValuePct price={c.price} scorecard={c.scorecard} />
                          </td>
                          <td className="hidden px-2 text-right xl:table-cell">
                            <span >
                              <ImpliedGrowth reverse={c.scorecard?.reverseDcf} />
                            </span>
                          </td>
                          <td className="hidden px-2 text-right font-mono md:table-cell">{cagrText(c._return?.scenarios?.[0]?.cagr)}</td>
                          <td className={'px-2 text-right font-mono '+(c._return?.passes?'text-gain':'text-warn')}>{cagrText(c._return?.scenarios?.[1]?.cagr)}</td>
                          <td className="hidden max-w-[14rem] truncate px-2 text-xs text-muted-foreground xl:table-cell" title={review.reasons[0]}>
                            {review.label}
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums">{px(c.price, c.currency)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-line bg-background">
                            <td colSpan={12} className="p-3">
                              <div className="grid gap-3 lg:grid-cols-2">
                                <div className="grid min-w-0 content-start gap-3">
                                  <div className="text-xs text-muted-foreground sm:hidden">
                                    <GateGlyphs scorecard={c.scorecard} labels />
                                  </div>
                                  <div>
                                    {c.status === 'eligible' ? (
                                      <InvestmentDecision discovery={discovery} ticker={c.ticker} price={c.price} period={c.metrics?.statementDate} portfolioReason={idea?.decision === 'enter' ? undefined : review.reasons[0]} />
                                    ) : (
                                      <>
                                        <p className="text-[13px]">
                                          <strong>{review.label}</strong>
                                        </p>
                                        <ul className="mt-1 grid list-disc gap-0.5 pl-4 text-xs text-muted-foreground">
                                          {review.reasons.slice(0, 3).map((r: string) => (
                                            <li key={r}>{r}</li>
                                          ))}
                                        </ul>
                                      </>
                                    )}
                                  </div>
                                  <details className="text-xs">
                                    <summary className="cursor-pointer font-medium text-muted-foreground">Screen criteria & evidence</summary>
                                    <ul className="mt-1 grid gap-1">
                                      {c.matchedScreens.map((m: any, i: number) => (
                                        <li key={i}>
                                          <strong>{m.bucket}:</strong> {m.criteria}
                                        </li>
                                      ))}
                                      {[...c.gateReasons, ...c.evidenceGaps].map((r: string, i: number) => (
                                        <li key={'g' + i} className="text-muted-foreground">{r}</li>
                                      ))}
                                    </ul>
                                  </details>
                                </div>
                                <div className="grid min-w-0 content-start gap-3">
                                  <div>
                                    <InlineTradePlan
                                      ticker={c.ticker}
                                      portfolio={portfolio === 'All portfolios' ? undefined : portfolio}
                                      action={c.status === 'eligible' && idea?.decision === 'enter' ? 'buy' : 'watch'}
                                      budget={budget}
                                      revision={discoveryData.reportAsOf}
                                      referencePrice={c.price}
                                      currency={c.currency}
                                      reason={review.state === 'enter' ? undefined : review.reasons[0]}
                                      pending={review.state === 'pending'}
                                      buyReview
                                    />
                                  </div>
                                  <div>
                                    <ReportEvidence ticker={c.ticker} scorecard={c.scorecard} compact />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <button onClick={() => showExecution(c.ticker, portfolio === 'All portfolios' ? undefined : portfolio, budget)} className="inline-flex items-center gap-1 text-brand hover:underline">
                                      <TrendingUp className="size-3.5" /> Price & shares
                                    </button>
                                    <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                                      Market source <ExternalLink className="size-3" />
                                    </a>
                                    <span className={cn('ml-auto font-mono text-[11px]', c.stale ? 'text-warn' : 'text-muted-foreground')}>
                                      {c.stale ? 'Stale · ' : ''}
                                      {date(c.quoteTime)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!rows.length && <Empty>{search ? 'No stocks match.' : 'No candidates in this group. Screening failures are not treated as an empty universe.'}</Empty>}
            {rows.length > shown && (
              <button onClick={() => setShown(shown + PAGE)} className="w-full border-t border-line py-2 text-xs text-brand hover:bg-hover">
                Show {Math.min(PAGE, rows.length - shown)} more · {shown} of {rows.length}
              </button>
            )}
            <details className="group border-t border-line">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Screening coverage and data sources
              </summary>
              <div className="border-t border-line p-3">
                <p className="mb-2 text-xs text-muted-foreground">{discovery.scope}. Seven Jarvis gates are mandatory; warnings only reduce the position size.</p>
                <DiscoveryCoverage discovery={discovery} market={market} />
              </div>
            </details>
          </>
        )}
      </Panel>
    </div>
  );
}

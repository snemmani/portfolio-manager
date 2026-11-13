'use client';

import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, ArrowRight, FileText, Sparkles, ChevronRight } from 'lucide-react';
import { date, Markdown } from './shared';
import { useHoldings, useDiscovery, useAnalysis } from './view-data';
import type { ViewProps } from './types';
import { mergeRecommendations } from '../../lib/merge-recommendations';
import { actionLabel, priorityOrderLabel } from '../../lib/recommendation-order';
import { supportLabel } from '../../lib/card-copy';
import FundamentalResearch from '../fundamental-research';
import RecommendationCopy from '../recommendation-copy';
import InlineTradePlan from '../inline-trade-plan';
import { Panel, SignalBadge, GateGlyphs, ValuePct, Segmented, Empty } from '../terminal/ui';
import { px, symbol } from '../terminal/format';

type Group = 'decide' | 'watch' | 'waiting' | 'quiet';
const GROUP_TEXT: Record<Group, string> = {
  decide: `${priorityOrderLabel}. Each decision shows the gates, the reason and the price plan.`,
  watch: 'A mandatory check fails. No additions; confirm the reason for owning the company still holds.',
  waiting: 'The financial gates pass. Adding still needs a current company review, a margin of safety and a sign of technical support.',
  quiet: 'Nothing to do: holdings that pass their checks, and locked plans.',
};

export default function RecommendationsView({ data, portfolio, setSelected, showExecution }: ViewProps) {
  const holdings = useHoldings(data, portfolio);
  const analysisState = useAnalysis();
  const analysis = analysisState.data;
  const discoveryData = useDiscovery(portfolio).data;

  const cards = useMemo(
    () =>
      mergeRecommendations(
        holdings,
        (analysis?.report?.recommendations || []).filter((r: any) => portfolio === 'All portfolios' || r.portfolio === portfolio),
        { rulesBased: true, fundamentalPolicy: 'investor-v1', ...(discoveryData?.discovery || {}) },
      ),
    [holdings, analysis, portfolio, discoveryData],
  );
  const groups = useMemo(() => {
    const g: Record<Group, any[]> = { decide: [], watch: [], waiting: [], quiet: [] };
    for (const c of cards) {
      const a = String(c.action || '').toLowerCase();
      g[a === 'hold' || a === 'locked' ? 'quiet' : a === 'watch' ? 'watch' : a === 'review' ? 'waiting' : 'decide'].push(c);
    }
    return g;
  }, [cards]);
  const [group, setGroup] = useState<Group>('decide');
  const [touched, setTouched] = useState(false);
  // Open the first non-empty group until the user picks one.
  useEffect(() => {
    if (!touched) setGroup((['decide', 'watch', 'waiting', 'quiet'] as Group[]).find((k) => groups[k].length) || 'decide');
  }, [groups, touched]);
  const rows = groups[group];
  const revision = (analysis?.report?.updated_at || '') + data?.asOf;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={group}
          onChange={(g) => {
            setTouched(true);
            setGroup(g);
          }}
          options={[
            { value: 'decide', label: 'Decide', count: groups.decide.length },
            { value: 'watch', label: 'Watch', count: groups.watch.length },
            { value: 'waiting', label: 'Waiting', count: groups.waiting.length },
            { value: 'quiet', label: 'No action', count: groups.quiet.length },
          ]}
        />
        <p className="text-xs text-muted-foreground">{GROUP_TEXT[group]}</p>
      </div>

      {(group === 'decide' || group === 'watch') &&
        (rows.length ? (
          <div className="grid gap-3 2xl:grid-cols-2">
            {rows.map((card: any) => (
              <article key={card.id} className="rounded-md border border-line bg-panel">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
                  <SignalBadge action={actionLabel(card.action)} label={card.action==='Review'?card.holding?.purchaseStep?.label:undefined} title={card.holding?.purchaseStep?.reason}/>
                  <button onClick={() => setSelected(card.holding)} className="font-mono text-sm font-semibold hover:text-brand">
                    {symbol(card.ticker)}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {card.portfolio} · {typeof card.weight === 'number' ? `${card.weight.toFixed(1)}% weight` : 'weight —'} · {supportLabel(card.confidence)}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <GateGlyphs scorecard={card.holding?.scorecard} />
                    <span className="font-mono text-sm tabular-nums">{px(card.price, card.currency)}</span>
                  </span>
                </header>
                <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <RecommendationCopy reasons={card.reasons} risks={card.risks} action={card.copyAction} />
                    {card.additionalReasons?.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">{card.additionalLabel}</summary>
                        {card.additionalReasons.map((r: string, i: number) => (
                          <p key={i} className="mt-1">{r}</p>
                        ))}
                      </details>
                    )}
                  </div>
                  <div className="min-w-0">
                    <InlineTradePlan ticker={card.ticker} portfolio={card.portfolio} action={card.action} revision={revision} referencePrice={card.price} currency={card.currency} />
                  </div>
                </div>
                <footer className="flex gap-4 border-t border-line px-3 py-2 text-xs">
                  <button onClick={() => showExecution(card.ticker, card.portfolio, undefined, !card.nonDiscretionary, card.action==='Profit review'?'profit':undefined)} className="inline-flex items-center gap-1 text-brand hover:underline">
                    <TrendingUp className="size-3.5" /> Full price plan
                  </button>
                  <button onClick={() => setSelected(card.holding)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    Checklist & details <ArrowRight className="size-3.5" />
                  </button>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <Panel>
            <Empty>
              {group === 'decide'
                ? 'Nothing needs a decision: no concentration above 17%, no serious red flag and no triggered profit review.'
                : 'No holding is failing a mandatory check.'}
            </Empty>
          </Panel>
        ))}

      {(group === 'waiting' || group === 'quiet') && (
        <Panel flush>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-raised text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="h-8 px-3 text-left font-semibold">Stock</th>
                    <th className="hidden px-2 text-left font-semibold md:table-cell">Portfolio</th>
                    <th className="px-2 text-right font-semibold">Weight</th>
                    <th className="hidden px-2 text-left font-semibold sm:table-cell">Gates</th>
                    <th className="hidden px-2 text-right font-semibold lg:table-cell">P / Value</th>
                    <th className="px-3 text-left font-semibold">Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c: any) => (
                    <tr
                      key={c.id}
                      tabIndex={0}
                      onClick={() => setSelected(c.holding)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelected(c.holding)}
                      className="h-9 cursor-pointer border-b border-line/70 last:border-0 hover:bg-hover"
                    >
                      <td className="px-3">
                        <span className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{symbol(c.ticker)}</span>
                          <SignalBadge action={actionLabel(c.action)} label={c.action==='Review'?c.holding?.purchaseStep?.label:undefined} title={c.holding?.purchaseStep?.reason}/>
                        </span>
                      </td>
                      <td className="hidden px-2 text-muted-foreground md:table-cell">{c.portfolio}</td>
                      <td className="px-2 text-right font-mono tabular-nums">{typeof c.weight === 'number' ? `${c.weight.toFixed(1)}%` : '—'}</td>
                      <td className="hidden px-2 sm:table-cell">
                        <GateGlyphs scorecard={c.holding?.scorecard} />
                      </td>
                      <td className="hidden px-2 text-right lg:table-cell">
                        <ValuePct price={c.price} scorecard={c.holding?.scorecard} />
                      </td>
                      <td className="max-w-[28rem] truncate px-3 text-xs text-muted-foreground" title={c.reasons?.[0]}>
                        {c.reasons?.[0] || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nothing here.</Empty>
          )}
        </Panel>
      )}

      <p className="text-[11px] text-muted-foreground">
        Financial and portfolio rules decide trades; AI adds context. Check the current event and price plan before ordering. No trades are placed here.
      </p>

      <details className="group rounded-md border border-line bg-panel">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          <Sparkles className="size-3.5" /> Latest AI portfolio briefing
          {analysis?.report?.updated_at && <span className="ml-auto font-mono normal-case tracking-normal">{date(analysis.report.updated_at)}</span>}
        </summary>
        <div className="border-t border-line p-3">
          {analysisState.error && (
            <div className="mb-2 flex items-center gap-2 text-xs text-loss">
              {analysisState.error}
              <button onClick={analysisState.refresh} className="underline">
                Retry
              </button>
            </div>
          )}
          {analysis?.report?.body ? (
            <div>
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">
                Completed {date(analysis.report.updated_at)} · {analysis.report.model}
              </p>
              <Markdown text={analysis.report.body} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No completed portfolio briefing yet. Current portfolio checks are shown above.</p>
          )}
        </div>
      </details>

      <details className="group rounded-md border border-line bg-panel">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          <FileText className="size-3.5" /> Company investment cases & valuation references
        </summary>
        <div className="border-t border-line p-3">
          <FundamentalResearch discovery={discoveryData?.discovery} holdings={data?.holdings || []} portfolio={portfolio} market="India" />
        </div>
      </details>
    </div>
  );
}

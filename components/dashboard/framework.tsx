'use client';

import { ShieldCheck, AlertTriangle, LineChart, ExternalLink, Calculator, Target } from 'lucide-react';
import { useApi } from '../../lib/client/use-api';
import type { ViewProps } from './types';
import { THRESHOLDS, VALUATION } from '../../lib/jarvis-gates';
import { RETURN_POLICY } from '../../lib/return-potential';
import { RULES } from '../../lib/engine';
import { Panel } from '../terminal/ui';

/** The Jarvis policy as the code enforces it (values read from lib/jarvis-gates.ts). */
export default function FrameworkView({}: ViewProps) {
  const mandatory: [string, string][] = [
    ['Data integrity', 'A usable price, statements in (or convertible to) the trading currency, and annual statements no older than 18 months.'],
    ['Solvency', `Debt/equity below ${THRESHOLDS.debtEquityMax}, interest cover above ${THRESHOLDS.interestCoverMin}× and Altman Z above ${THRESHOLDS.altmanMin}. Banks and lenders: capital adequacy and bad loans from the company review.`],
    ['Earnings quality', `Operating cash flow at least ${THRESHOLDS.cashConversionMin * 100}% of profit over three years, and no serious forensic red flag (Beneish M-score above ${THRESHOLDS.beneishFlag} with high accruals or receivables outpacing sales, or a serious finding in the company review).`],
    ['Return on capital', `Median ROCE of at least ${THRESHOLDS.roceMin}% over the available years. Lenders: median ROE ≥ ${THRESHOLDS.roeMinFinancial}% or median ROA ≥ ${THRESHOLDS.roaMinFinancial}%.`],
    ['Annualised total return', `At least ${RETURN_POLICY.hurdles.INR*100}% a year (India) or ${RETURN_POLICY.hurdles.USD*100}% (US) projected total return over five years: price target plus dividends after a ${RETURN_POLICY.dividendTax*100}% tax haircut. The target is capped at year-5 EPS × the lower of the forecast exit P/E and the higher of today's and the historical median P/E. The five-year bear case must return the capital. Blocks when projection inputs are missing. A forecast is not a guarantee.`],
    ['Margin of safety', 'Price at or below the lowest of the code valuation, researched maximum entry and the five-year return entry ceiling (hurdle and bear-case limits).'],
    ['Position and sector caps', `${RULES.single}% per stock (trim once above ${RULES.trimTrigger}%), 25% cyclical, 20% commodity, 15% Category C, household single-stock 15%.`],
    ['No serious red flag', `Fraud, regulator action, auditor resignation, default, insolvency, promoter-pledge invocation, trading suspension and similar. Coverage must be under ${THRESHOLDS.eventCoverageHours} hours old.`],
  ];
  const warnings = [
    'A single year of falling profit or revenue',
    'Forward EPS below trailing EPS; stretched forward P/E',
    'Cautious analyst rating (3.0 or worse)',
    'Missed Jarvis bucket thresholds (growth, ROE, margin, P/E, P/B, PEG)',
    'Weak cash conversion last year; receivables outpacing sales',
    'Altman Z in the grey zone; elevated but uncorroborated Beneish score',
    'Results due within 14 days; ordinary company headlines',
    'Unverified accounting notes or other research gaps',
  ];
  const h = 'mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-brand" /> Mandatory · all must pass</span>} flush>
        <p className="border-b border-line px-3 py-2.5 text-sm">
          A stock does not need to be perfect; it must pass these seven gates. Missing evidence counts as <em>evidence needed</em>, never as a pass.
        </p>
        <ol className="divide-y divide-line">
          {mandatory.map(([title, detail], i) => (
            <li key={title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 px-3 py-2.5">
              <span className="font-mono text-xs text-brand">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-3">
        <Panel>
          <h3 className={h}>
            <AlertTriangle className="size-3.5 text-warn" /> Warnings shrink the position
          </h3>
          <ul className="grid gap-1 text-sm">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="mt-[7px] block size-1.5 shrink-0 rounded-[1px] bg-warn" />
                {w}
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-center [&>div]:bg-raised [&>div]:p-2">
            <div>
              <div className="font-mono text-sm font-semibold">0</div>
              <div className="text-[11px] text-muted-foreground">5% new · 10% add</div>
            </div>
            <div>
              <div className="font-mono text-sm font-semibold text-warn">1–2</div>
              <div className="text-[11px] text-muted-foreground">capped at {THRESHOLDS.warnedPositionCapPct}%</div>
            </div>
            <div>
              <div className="font-mono text-sm font-semibold text-loss">{THRESHOLDS.watchlistWarnings}+</div>
              <div className="text-[11px] text-muted-foreground">watchlist</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Ex-dividend dates are shown but do not count.</p>
        </Panel>

        <Panel>
          <h3 className={h}>
            <LineChart className="size-3.5 text-info" /> Timing (satellite)
          </h3>
          <p className="text-sm leading-relaxed">
            Buy-ins need a sign of support: holding a swing low or key average for three sessions, RSI recovering from oversold, or reclaiming the 50-day average. Trims need over-extension: 25% above the 200-day average, weekly RSI ≥ 75, daily RSI ≥ 75 at a 52-week high, or climax volume. One signal trims 10%; two or more trim 20%. Concentration trims above {RULES.trimTrigger}% are always proposed.
          </p>
        </Panel>

        <ForecastTrackRecord heading={h} />

        <Panel>
          <h3 className={h}>
            <Calculator className="size-3.5 text-brand" /> Valuation
          </h3>
          <dl className="mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line font-mono text-xs [&>div]:bg-raised [&>div]:p-2">
            <div>
              <dt className="text-muted-foreground">India</dt>
              <dd>
                {VALUATION.IN.discount * 100}% · cap {VALUATION.IN.growthCap * 100}% → {VALUATION.IN.terminal * 100}%
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">US</dt>
              <dd>
                {VALUATION.US.discount * 100}% · cap {VALUATION.US.growthCap * 100}% → {VALUATION.US.terminal * 100}%
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Discount rate · growth cap fading to terminal growth over ten years. Growth starts from the lower of revenue and profit compound growth; only earnings not needed for reinvestment (growth ÷ ROCE) count. Lenders use justified price-to-book. The reverse DCF runs the same model backwards: the growth today’s price requires against what the company has delivered. It informs judgement; it is not a gate.
          </p>
          <a
            href="https://github.com/snemmani/jarvis/blob/5750d4bf5e7187eb052129e8e282c53edaf35cdf/bujo/portoflio/rebalance.py"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            Source framework <ExternalLink className="size-3" />
          </a>
        </Panel>
      </div>
    </div>
  );
}

const pts = (v: number | null | undefined, signed = false) =>
  typeof v === 'number' && Number.isFinite(v) ? `${signed && v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '—';

/** Logged five-year forecasts scored against actual prices, so the hurdle can be tuned to how accurate forecasts really are. */
function ForecastTrackRecord({ heading }: { heading: string }) {
  const { data, error } = useApi('/api/analysis?calibration=1', { interval: 3600000, timeout: 60000 });
  const tone = data?.bias === 'optimistic' ? 'text-loss' : data?.bias === 'calibrated' ? 'text-gain' : 'text-muted-foreground';
  return (
    <Panel>
      <h3 className={heading}>
        <Target className="size-3.5 text-brand" /> Forecast track record
      </h3>
      {error && !data ? (
        <p className="text-xs text-muted-foreground">The forecast log is unavailable.</p>
      ) : !data ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <>
          <dl className="mb-2 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-center [&>div]:bg-raised [&>div]:p-2">
            <div>
              <dt className="text-[11px] text-muted-foreground">Logged</dt>
              <dd className="font-mono text-sm font-semibold">{data.total}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Scored (≥1 yr)</dt>
              <dd className="font-mono text-sm font-semibold">{data.scoredCount}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Median miss / yr</dt>
              <dd className={`font-mono text-sm font-semibold ${tone}`}>{pts(data.medianError, true)}</dd>
            </div>
          </dl>
          <p className={`text-sm ${tone}`}>{data.verdict}</p>
          {data.limitation&&<p className="mt-1 text-xs text-muted-foreground">{data.limitation}</p>}
          {data.scoredCount > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Forecast {pts(data.meanForecastCagr)} vs actual {pts(data.meanRealizedCagr)} a year on average · beat rate {pts(data.beatRate)}
              {data.passedCount ? ` · return-qualified forecasts median miss ${pts(data.passedMedianError, true)}` : ''}.
            </p>
          )}
          {data.entries?.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Recent forecasts</summary>
              <ul className="mt-1 divide-y divide-line font-mono">
                {data.entries.slice(0, 20).map((e: any) => (
                  <li key={e.ticker + e.recordedAt} className="flex flex-wrap justify-between gap-x-3 py-1">
                    <span>{e.ticker}{e.passed ? ' ✓' : ''}</span>
                    <span className="text-muted-foreground">{e.recordedAt.slice(0, 10)}</span>
                    <span>
                      {e.status === 'scored'
                        ? `${pts(e.realizedCagr)} vs ${pts(e.forecastCagr)} /yr`
                        : e.status === 'early'
                          ? `${pts(e.actualSoFar, true)} vs ${pts(e.expectedSoFar, true)} so far`
                          : 'no price'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Every accepted five-year forecast is logged with its review-time price. Price growth is compared with the forecast price path (dividends excluded on both sides), restated for splits. ✓ = cleared the return gate when recorded.
          </p>
        </>
      )}
    </Panel>
  );
}

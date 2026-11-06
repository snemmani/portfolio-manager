'use client';

import { ShieldCheck, Check, AlertTriangle, LineChart, ExternalLink } from 'lucide-react';
import type { ViewProps } from './types';
import { THRESHOLDS, VALUATION } from '../../lib/jarvis-gates';
import { RULES } from '../../lib/engine';

/** The Jarvis policy as the code enforces it (values read from lib/jarvis-gates.ts). */
export default function FrameworkView({}: ViewProps) {
  const mandatory: [string, string][] = [
    ['Data integrity', `A usable price, statements in (or convertible to) the trading currency, and annual statements no older than 18 months.`],
    ['Solvency', `Debt/equity below ${THRESHOLDS.debtEquityMax}, interest cover above ${THRESHOLDS.interestCoverMin}× and Altman Z above ${THRESHOLDS.altmanMin}. Banks and lenders: capital adequacy and bad loans from the company review.`],
    ['Earnings quality', `Operating cash flow at least ${THRESHOLDS.cashConversionMin * 100}% of profit over three years, and no serious forensic red flag (Beneish M-score above ${THRESHOLDS.beneishFlag} with high accruals or receivables outpacing sales, or a serious finding in the company review).`],
    ['Return on capital', `Median ROCE of at least ${THRESHOLDS.roceMin}% over the available years. Lenders: median ROE ≥ ${THRESHOLDS.roeMinFinancial}% or median ROA ≥ ${THRESHOLDS.roaMinFinancial}%.`],
    ['Margin of safety', `Price at or below the lower of the code valuation and the researched maximum entry price.`],
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
  return (
    <div className="framework-layout">
      <section className="panel framework-detail">
        <span className="section-kicker">
          <ShieldCheck size={14} /> MANDATORY — ALL MUST PASS
        </span>
        <h2>Seven checks protect the capital. Everything else sizes the position.</h2>
        <p>
          A stock does not need to be perfect. It must pass these seven gates. Missing evidence counts as
          “evidence needed”, never as a pass.
        </p>
        {mandatory.map(([title, detail], i) => (
          <div className="framework-rule" key={title}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
          </div>
        ))}
      </section>

      <aside className="panel coverage">
        <h2>
          <AlertTriangle size={16} /> Warnings shrink the position
        </h2>
        <ul>
          {warnings.map((w) => (
            <li key={w}>
              <Check size={16} />
              {w}
            </li>
          ))}
        </ul>
        <p>
          0 warnings: normal targets (5% new, 10% addition). 1–2 warnings: capped at {THRESHOLDS.warnedPositionCapPct}%.{' '}
          {THRESHOLDS.watchlistWarnings} or more: watchlist. Ex-dividend dates are shown but do not count.
        </p>
        <h2 style={{ marginTop: 20 }}>
          <LineChart size={16} /> Timing (satellite)
        </h2>
        <p>
          Buy-ins need a sign of support: holding a swing low or key average for three sessions, RSI recovering from
          oversold, or reclaiming the 50-day average. Trims need over-extension: 25% above the 200-day average, weekly
          RSI ≥ 75, daily RSI ≥ 75 at a 52-week high, or climax volume. One signal trims 10%; two or more trim 20%.
          Concentration trims above {RULES.trimTrigger}% are always proposed.
        </p>
        <h2 style={{ marginTop: 20 }}>Valuation assumptions</h2>
        <p>
          India: {VALUATION.IN.discount * 100}% discount rate, growth capped at {VALUATION.IN.growthCap * 100}% fading to{' '}
          {VALUATION.IN.terminal * 100}% over ten years. US: {VALUATION.US.discount * 100}%, {VALUATION.US.growthCap * 100}% →{' '}
          {VALUATION.US.terminal * 100}%. Growth starts from the lower of revenue and profit compound growth; only
          earnings not needed for reinvestment (growth ÷ ROCE) count. Lenders use justified price-to-book. The reverse DCF runs the same model backwards: the growth today’s price requires, against what the company has delivered (lenders: perpetual growth implied by price-to-book). It informs judgement; it is not an extra gate.
        </p>
        <a
          href="https://github.com/snemmani/jarvis/blob/5750d4bf5e7187eb052129e8e282c53edaf35cdf/bujo/portoflio/rebalance.py"
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          View source framework <ExternalLink size={13} />
        </a>
      </aside>
    </div>
  );
}

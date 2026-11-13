'use client';

import { useState } from 'react';
import { Check, AlertTriangle, FileText, Minus } from 'lucide-react';
import { useApi } from '../lib/client/use-api';
import { crossCheck, absolute, CROSS_CHECK_TOLERANCE } from '../lib/report-crosscheck';
import { formatIST } from '../lib/time';

/**
 * What the app took from an uploaded annual report, and how it was used.
 *  - ReportCard: the full evidence pack (library page).
 *  - ReportEvidence: a compact "From the annual report" panel for a company
 *    (holding drawer, cash cards), with the Yahoo cross-check and the review
 *    areas that cite the report.
 */

const AREA: Record<string, string> = {
  financial_delivery: 'Financial delivery',
  accounting: 'Accounting quality',
  balance_sheet: 'Balance sheet',
  moat: 'Competitive position',
  management: 'Management',
  valuation: 'Valuation',
  outlook: 'Outlook',
  sector_checks: 'Sector checks',
};

export function money(v: number | null | undefined, currency?: string | null) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const neg = v < 0 ? '−' : '', a = Math.abs(v);
  if (currency === 'INR') return `${neg}₹${(a / 1e7).toLocaleString('en-IN', { maximumFractionDigits: a >= 1e10 ? 0 : 1 })} Cr`;
  const sym = currency === 'USD' ? '$' : currency ? currency + ' ' : '';
  return a >= 1e9 ? `${neg}${sym}${(a / 1e9).toFixed(2)}B` : `${neg}${sym}${(a / 1e6).toFixed(1)}M`;
}

const FIN_ROWS: [string, string][] = [
  ['revenue', 'Revenue'],
  ['netIncome', 'Profit (owners)'],
  ['operatingCashFlow', 'Operating cash flow'],
  ['freeCashFlow', 'Free cash flow'],
  ['debt', 'Borrowings + leases'],
  ['equity', "Owners' equity"],
];
const fy = (period: string) => {
  const d = new Date(period);
  return Number.isFinite(d.getTime()) ? (d.getUTCMonth() <= 5 ? 'FY' + String(d.getUTCFullYear()).slice(2) : String(d.getUTCFullYear())) : period;
};
const pagesOf = (f: any) => [...new Set((f?.evidence || []).map((e: any) => e.page).filter(Boolean))].sort((a: any, b: any) => a - b);

function FinancialTable({ financials, statements }: { financials: any[]; statements?: any }) {
  const periods = [...financials].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  const cc = crossCheck(financials, statements);
  const latest = periods[0]?.period?.slice(0, 10);
  const yahooFor = (metric: string) => cc.rows.find((r) => r.metric === metric && r.period === latest);
  const showYahoo = cc.rows.some((r) => r.status !== 'missing');
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs tabular-nums">
        <thead>
          <tr>
            <th className="h-7 border-b border-line px-2 text-left" />
            {periods.map((f) => (
              <th key={f.period} className="h-7 border-b border-line px-2 text-right font-sans text-[11px] font-semibold text-muted-foreground">{fy(f.period)}</th>
            ))}
            {showYahoo && <th title={`Yahoo Finance, ${fy(latest)}`} className="h-7 border-b border-line px-2 text-right font-sans text-[11px] font-semibold text-muted-foreground">Yahoo {fy(latest)}</th>}
          </tr>
        </thead>
        <tbody>
          {FIN_ROWS.map(([key, label]) => {
            const y = yahooFor(key);
            return (
              <tr key={key} className="border-b border-line/70">
                <th scope="row" className="h-7 px-2 text-left font-sans text-xs font-normal text-muted-foreground">{label}</th>
                {periods.map((f) => (
                  <td key={f.period} className="px-2 text-right">{money(absolute(f, key), f.currency)}</td>
                ))}
                {showYahoo && (
                  <td className={'px-2 text-right whitespace-nowrap ' + (y?.status === 'match' ? 'text-gain' : y?.status === 'differs' ? 'font-semibold text-loss' : 'text-muted-foreground')} title={y?.diffPct != null ? `${y.diffPct > 0 ? '+' : ''}${y.diffPct}% vs the report (tolerance ±${CROSS_CHECK_TOLERANCE[y.metric]}%)` : undefined}>
                    {y ? (
                      <>
                        {y.status === 'match' ? <Check size={12} strokeWidth={3} className="inline" /> : y.status === 'differs' ? <AlertTriangle size={12} className="inline" /> : <Minus size={12} className="inline" />}{' '}
                        {money(y.yahoo, cc.currency)}
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <small className="mt-1.5 block text-[11px] text-muted-foreground">
        Every figure is quoted from the PDF and checked against its page
        {periods.map((f) => (pagesOf(f).length ? ` · ${fy(f.period)} pages ${pagesOf(f).join(', ')}` : '')).join('')}.
      </small>
    </div>
  );
}

/** Report figures vs Yahoo, as a verdict line plus the differing rows. */
export function CrossCheckSummary({ financials, statements }: { financials: any[]; statements?: any }) {
  const cc = crossCheck(financials, statements);
  if (!cc.matched && !cc.differs) return <p className="text-xs text-muted-foreground">{cc.note}</p>;
  const bad = cc.rows.filter((r) => r.status === 'differs');
  return (
    <div className={'grid gap-1.5 rounded-md border px-3 py-2 text-xs ' + (bad.length ? 'border-loss/40 bg-loss-soft' : 'border-gain/40 bg-gain-soft')}>
      <strong className={'flex items-center gap-1.5 ' + (bad.length ? 'text-loss' : 'text-gain')}>
        {bad.length ? <AlertTriangle size={13} /> : <Check size={13} strokeWidth={3} />}{' '}
        {bad.length
          ? `Yahoo differs from the audited report on ${bad.length} of ${cc.matched + cc.differs} figures`
          : `Yahoo matches the audited report (${cc.matched} figures)`}
      </strong>
      {bad.length > 0 && (
        <ul className="grid gap-0.5 font-mono">
          {bad.map((r) => (
            <li key={r.metric + r.period}>
              {r.label} {fy(r.period)}: report {money(r.report, cc.currency)}, Yahoo {money(r.yahoo, cc.currency)} ({r.diffPct === null ? 'audited figure is zero' : `${r.diffPct > 0 ? '+' : ''}${r.diffPct}%`})
            </li>
          ))}
        </ul>
      )}
      <small className="text-[11px] text-muted-foreground">
        The multi-year checks use Yahoo's figures. A difference can mean a restatement, consolidated vs standalone
        figures, or bad data; it is a prompt to look, not a failed check.
      </small>
    </div>
  );
}

/**
 * Yahoo statement rows for a ticker, loaded only when asked: from holdings first, then
 * screened candidates. Used where the page does not already carry the scorecard.
 */
function useStatements(ticker: string | undefined, enabled: boolean) {
  const holdings = useApi('/api/portfolio', { enabled, interval: 0, staleTime: 300000, timeout: 90000 });
  const held = ((holdings.data as any)?.holdings || []).find((h: any) => h.ticker === ticker && h.scorecard?.statements);
  const discovery = useApi('/api/discovery?portfolio=' + encodeURIComponent('All portfolios'), {
    enabled: enabled && !!holdings.data && !held,
    interval: 0,
    staleTime: 300000,
    timeout: 90000,
  });
  if (held) return held.scorecard.statements;
  const c = ((discovery.data as any)?.discovery?.candidates || []).find((c: any) => c.ticker === ticker);
  return c?.scorecard?.statements;
}

/** Full evidence pack for one report. `report` is the /summary payload (meta + summary + summaryAttempt). */
export function ReportCard({ report, statements: given, onClose, autoload = false }: { report: any; statements?: any; onClose?: () => void; autoload?: boolean }) {
  const s = report?.summary;
  const loaded = useStatements(report?.ticker, autoload && !given && !!s?.financials?.length);
  const statements = given || loaded;
  if (!s) {
    const issues = report?.summaryAttempt?.issues || report?.summaryIssues || [];
    return (
      <section className="grid gap-3 rounded-md border border-line bg-panel p-3 text-sm">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono text-sm font-semibold">
            {report?.ticker} · {report?.period && fy(report.period)} annual report
          </h3>
        </header>
        {report?.summaryStatus === 'needs_review' ? (
          <>
            <p className="flex gap-2 text-xs text-loss">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> The AI's summary was rejected by the page-quote check ({issues.length} issue
              {issues.length === 1 ? '' : 's'}). Nothing from this report is used until it passes. The next company review
              repairs this draft rather than starting over.
            </p>
            <ul className="grid list-disc gap-1 pl-4 text-xs leading-relaxed text-muted-foreground">
              {issues.slice(0, 12).map((i: any, n: number) => (
                <li key={n}>
                  {i.message}
                  {i.page ? ` (PDF page ${i.page})` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Not summarised yet. The next company review reads this report first; a first read of a large report can take up
            to 45 minutes and is reused afterwards.
          </p>
        )}
        {onClose && (
          <button className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-xs hover:bg-hover" onClick={onClose}>
            Close
          </button>
        )}
      </section>
    );
  }
  return (
    <section className="grid gap-3 rounded-md border border-line bg-panel p-3 text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold">
          {s.ticker} · {fy(s.period)} annual report
        </h3>
        <span className="inline-flex items-center gap-1 text-[11px] text-gain">
          <Check size={12} strokeWidth={3} /> Company confirmed on page {s.companyProof?.page}
          {s.periodProof?.page ? ` · period on page ${s.periodProof.page}` : ''}
        </span>
      </header>
      <p className="leading-relaxed">{s.summary}</p>
      {s.financials?.length > 0 && <FinancialTable financials={s.financials} statements={statements} />}
      {s.financials?.length > 0 && statements && <CrossCheckSummary financials={s.financials} statements={statements} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">What stood out</h4>
          <ul className="grid list-disc gap-1 pl-4 text-xs leading-relaxed">{(s.highlights || []).map((x: string) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Risks</h4>
          <ul className="grid list-disc gap-1 pl-4 text-xs leading-relaxed">{(s.risks || []).map((x: string) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
      {s.gaps?.length > 0 && (
        <>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Not found in the report</h4>
          <ul className="grid list-disc gap-1 pl-4 text-xs leading-relaxed text-muted-foreground">{s.gaps.map((x: string) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cited findings</h4>
      <ul className="grid gap-1.5 text-xs">
        {(s.evidence || []).map((e: any, i: number) => (
          <li key={i}>
            <details>
              <summary className="cursor-pointer leading-relaxed">
                <span className="mr-1.5 inline-block rounded-full border border-line bg-raised px-1.5 font-mono text-[10px] font-semibold text-muted-foreground">p. {e.page}</span>
                <strong>{e.topic}.</strong> {e.note}
              </summary>
              <blockquote className="mt-1 border-l-2 border-line-strong py-1 pl-3 text-muted-foreground [overflow-wrap:anywhere]">“{String(e.quote).replace(/(?:\s*[.…·]){3,}/g, ' … ')}”</blockquote>
            </details>
          </li>
        ))}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <small className="text-[11px] text-muted-foreground">
          Summarised {formatIST(s.createdAt)}. An evidence summary, not a recommendation; the investment decision still
          needs the mandatory checks.
        </small>
        <a className="inline-flex items-center gap-1 text-xs text-brand hover:underline" href={`/api/annual-reports/${report.id}/download`} target="_blank" rel="noreferrer">
          <FileText size={13} /> Open PDF
        </a>
        {onClose && (
          <button className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-xs hover:bg-hover" onClick={onClose}>
            Close
          </button>
        )}
      </footer>
    </section>
  );
}

/** The latest active report for a ticker from the library index. */
export function currentReport(reports: any[] | undefined, ticker: string) {
  return (reports || [])
    .filter((r) => r.ticker === ticker && r.status === 'ready')
    .sort((a, b) => String(b.period).localeCompare(String(a.period)))[0];
}

/** Areas of the company review that cite the uploaded report, and whether the review used this exact summary. */
export function reportUsage(review: any, report: any) {
  if (!review || !report) return { used: false, current: false, areas: [] as any[], researchedAt: null };
  const ids = new Set((review.sources || []).filter((s: any) => s.reportId === report.id).map((s: any) => s.id));
  const ref = (review.documentRefs || []).find((d: any) => d.id === report.id);
  return {
    used: ids.size > 0 || !!ref,
    current: !!ref && (ref.summaryHash || null) === (report.summaryHash || null),
    areas: (review.areas || []).filter((a: any) => (a.sourceIds || []).some((id: string) => ids.has(id))),
    researchedAt: review.researchedAt || null,
  };
}

/** Compact panel: what the report says about this company and how the review used it. */
export function ReportEvidence({ ticker, scorecard, compact = false }: { ticker: string; scorecard?: any; compact?: boolean }) {
  const index = useApi('/api/annual-reports', { interval: 0, staleTime: 120000 });
  const analysis = useApi('/api/analysis', { interval: 0, staleTime: 300000 });
  const [open, setOpen] = useState(!compact);
  const [full, setFull] = useState(false);
  const report = currentReport((index.data as any)?.reports, ticker);
  const detail = useApi(report ? `/api/annual-reports/${report.id}/summary` : '/api/annual-reports', {
    enabled: !!report && open,
    interval: 0,
    staleTime: 600000,
  });
  if (!report) {
    if (compact) return null;
    return (
      <div className="mt-4 rounded-md border border-dashed border-line p-3 text-xs text-muted-foreground">
        <h3 className="mb-1 text-sm font-semibold text-foreground">From the annual report</h3>
        <p>
          No annual report uploaded for {ticker}. Add one under <a className="text-brand hover:underline" href={`/reports?ticker=${encodeURIComponent(ticker)}`}>Annual reports</a>; the
          next company review then cites it and its figures are checked against Yahoo.
        </p>
      </div>
    );
  }
  const r = (detail.data as any)?.report?.id === report.id ? (detail.data as any).report : null;
  const s = r?.summary;
  const usage = reportUsage((analysis.data as any)?.fundamentalReviews?.[ticker], report);
  const auditor = (s?.evidence || []).find((e: any) => /audit/i.test(e.topic || ''));
  const body = !r ? (
    <p className="text-xs text-muted-foreground">Loading the report summary…</p>
  ) : !s ? (
    <ReportCard report={r} />
  ) : full ? (
    <ReportCard report={r} statements={scorecard?.statements} onClose={() => setFull(false)} />
  ) : (
    <>
      {s.financials?.length > 0 && <CrossCheckSummary financials={s.financials} statements={scorecard?.statements} />}
      {auditor && (
        <p className="text-xs">
          <span className="mr-1.5 inline-block rounded-full border border-line bg-raised px-1.5 font-mono text-[10px] font-semibold text-muted-foreground">p. {auditor.page}</span> <strong>Auditor:</strong> {auditor.note}
        </p>
      )}
      <div className="grid gap-1.5">
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">How the company review used it</h4>
        {!usage.used ? (
          <p className="text-xs text-muted-foreground">Not used yet: no company review has cited this report. Run a review to use it.</p>
        ) : (
          <>
            {!usage.current && (
              <p className="flex gap-1.5 text-xs text-warn">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> The review predates the latest summary of this report; re-run it to use the
                current evidence.
              </p>
            )}
            {usage.areas.length ? (
              <ul className="grid gap-1.5">
                {usage.areas.map((a: any) => (
                  <li key={a.area} className="rounded-md border border-line bg-panel px-3 py-2">
                    <strong className="mr-2 text-[13px]">{AREA[a.area] || a.area}</strong>
                    <span className={'rounded-full border px-1.5 text-[10px] font-semibold ' + (a.status === 'pass' ? 'border-gain/40 text-gain' : a.status === 'concern' ? 'border-loss/40 text-loss' : 'border-line text-muted-foreground')}>{a.status === 'pass' ? 'Supports' : a.status === 'concern' ? (a.materiality === 'blocking' ? 'Blocking concern' : 'Concern') : 'Unverified'}</span>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.rationale}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">The review lists the report as a source but no assessment area cites it.</p>
            )}
            {usage.researchedAt && <small className="text-[11px] text-muted-foreground">Company review of {formatIST(usage.researchedAt)}.</small>}
          </>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">What stood out</h4>
          <ul className="grid list-disc gap-1 pl-4 text-xs leading-relaxed">{(s.highlights || []).slice(0, 3).map((x: string) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Risks</h4>
          <ul className="grid list-disc gap-1 pl-4 text-xs leading-relaxed">{(s.risks || []).slice(0, 3).map((x: string) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
      <button className="justify-self-start text-xs text-brand hover:underline" onClick={() => setFull(true)}>
        Full report card: figures, cited pages and quotes
      </button>
    </>
  );
  const title = (
    <>
      From the {fy(report.period)} annual report
      <span className={'rounded-full border px-2 text-[10px] font-semibold ' + (report.summaryStatus === 'ready' ? 'border-gain/40 bg-gain-soft text-gain' : 'border-warn/40 text-warn')}>
        {report.summaryStatus === 'ready' ? 'Summarised' : report.summaryStatus === 'needs_review' ? 'Needs repair' : 'Not summarised'}
      </span>
    </>
  );
  if (compact)
    return (
      <details className="rounded-md border border-line" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium">{title}</summary>
        {open && <div className="grid gap-3 border-t border-line p-3">{body}</div>}
      </details>
    );
  return (
    <div className="mt-4 grid gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">{title}</h3>
      {body}
    </div>
  );
}

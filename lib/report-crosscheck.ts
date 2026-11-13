/**
 * Audited annual-report figures against the Yahoo Finance statements the multi-year
 * gates use. Informational: a difference flags data worth checking (restatements,
 * consolidated vs standalone, profit attributable vs total), it does not change a gate.
 */
export type CrossCheckRow = {
  metric: 'revenue' | 'netIncome' | 'operatingCashFlow';
  label: string;
  period: string;
  report: number | null;
  yahoo: number | null;
  diffPct: number | null;
  status: 'match' | 'differs' | 'missing';
};
export type CrossCheck = {rows: CrossCheckRow[]; matched: number; differs: number; note: string | null; currency: string | null};

export const CROSS_CHECK_TOLERANCE: Record<CrossCheckRow['metric'], number> = {revenue: 2, netIncome: 3, operatingCashFlow: 5};
const LABELS: Record<CrossCheckRow['metric'], string> = {revenue: 'Revenue', netIncome: 'Profit (owners)', operatingCashFlow: 'Operating cash flow'};
const finite = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);
const DAY = 86_400_000;

/** A report figure in absolute currency units. */
export const absolute = (f: any, key: string) => (finite(f?.[key]) ? f[key] * (finite(f.unitMultiplier) && f.unitMultiplier > 0 ? f.unitMultiplier : 1) : null);

export function crossCheck(financials: any[] | null | undefined, statements: {currency?: string; rows?: any[]} | null | undefined): CrossCheck {
  const empty = (note: string): CrossCheck => ({rows: [], matched: 0, differs: 0, note, currency: null});
  if (!financials?.length) return empty('The report summary has no financial table.');
  if (!statements?.rows?.length) return empty('Yahoo Finance statements are not loaded for this company yet.');
  const rows: CrossCheckRow[] = [];
  let currencyNote: string | null = null;
  for (const f of [...financials].sort((a, b) => String(b.period).localeCompare(String(a.period)))) {
    if (f.currency && statements.currency && f.currency !== statements.currency) {
      currencyNote = `The report is in ${f.currency} and Yahoo's statements are in ${statements.currency}, so the figures are not compared.`;
      continue;
    }
    const t = Date.parse(f.period);
    const y = statements.rows.find((r) => Math.abs(Date.parse(r.period) - t) <= 20 * DAY);
    for (const metric of ['revenue', 'netIncome', 'operatingCashFlow'] as const) {
      const report = absolute(f, metric), yahoo = finite(y?.[metric]) ? y[metric] : null;
      const diffPct = finite(report) && finite(yahoo) && report !== 0 ? ((yahoo - report) / Math.abs(report)) * 100 : null;
      rows.push({
        metric,
        label: LABELS[metric],
        period: String(f.period).slice(0, 10),
        report,
        yahoo,
        diffPct: finite(diffPct) ? Math.round(diffPct * 10) / 10 : null,
        status: !finite(report) || !finite(yahoo) ? 'missing' : report === 0 ? (yahoo === 0 ? 'match' : 'differs') : Math.abs(diffPct!) <= CROSS_CHECK_TOLERANCE[metric] ? 'match' : 'differs',
      });
    }
  }
  if (!rows.length) return empty(currencyNote || 'No overlapping periods.');
  const compared = rows.filter((r) => r.status !== 'missing');
  return {
    rows,
    matched: compared.filter((r) => r.status === 'match').length,
    differs: compared.filter((r) => r.status === 'differs').length,
    note: !compared.length ? 'Yahoo has no statements for the report periods.' : currencyNote,
    currency: statements.currency || financials[0]?.currency || null,
  };
}

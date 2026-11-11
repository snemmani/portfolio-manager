import assert from 'node:assert/strict';
import {crossCheck, absolute} from '../lib/report-crosscheck';
import {reportUsage, currentReport, money} from '../components/report-evidence';

const fin = [
  {period: '2026-03-31', currency: 'INR', unitMultiplier: 1e7, revenue: 197792.78, netIncome: 17098.85, operatingCashFlow: 11657.36, freeCashFlow: 2051.91, debt: 133963.15, equity: 93096.35},
  {period: '2025-03-31', currency: 'INR', unitMultiplier: 1e7, revenue: 158749.75, netIncome: 12929.1, operatingCashFlow: 3175.81},
];
assert.equal(absolute(fin[0], 'revenue'), 197792.78e7, 'Report figures are scaled by their reporting unit');
const statements = {currency: 'INR', rows: [
  {period: '2026-03-31', revenue: 197792.78e7 * 1.004, netIncome: 17098.85e7 * 1.09, operatingCashFlow: 11657.36e7},
  {period: '2025-03-31', revenue: 158749.75e7, netIncome: null, operatingCashFlow: 3175.81e7 * 0.97},
]};
let c = crossCheck(fin, statements);
const row = (m: string, p: string) => c.rows.find((r) => r.metric === m && r.period === p)!;
assert.equal(row('revenue', '2026-03-31').status, 'match', 'A 0.4% revenue difference is within tolerance');
assert.equal(row('netIncome', '2026-03-31').status, 'differs', 'A 9% profit difference is flagged');
assert.equal(row('netIncome', '2026-03-31').diffPct, 9, 'The difference is reported in percent of the audited figure');
assert.equal(row('netIncome', '2025-03-31').status, 'missing', 'A missing Yahoo value is not counted as a match');
assert.equal(row('operatingCashFlow', '2025-03-31').status, 'match', 'Operating cash flow allows 5%');
assert.equal(c.differs, 1);
assert.equal(c.matched, 4);
c = crossCheck(fin, {currency: 'INR', rows: [{period: '2026-04-12', revenue: 197792.78e7}]});
assert.equal(c.matched, 1, 'Periods within 20 days are the same fiscal year');
c = crossCheck(fin, {currency: 'USD', rows: statements.rows});
assert.equal(c.matched + c.differs, 0, 'Different currencies are never compared');
assert.match(c.note!, /INR.*USD/);
assert.match(crossCheck(fin, undefined).note!, /not loaded/);
assert.match(crossCheck([], statements).note!, /no financial table/);

const report = {id: 'r_1', ticker: 'M&M.NS', period: '2026-03-31', status: 'ready', summaryHash: 'h2'};
assert.equal(currentReport([{...report, id: 'r_0', period: '2025-03-31'}, report, {...report, id: 'r_x', status: 'processing', period: '2027-03-31'}], 'M&M.NS').id, 'r_1', 'The latest ready report is current');
const review = {researchedAt: '2026-11-07T00:00:00Z', sources: [{id: 'S_UP', reportId: 'r_1'}, {id: 'S_WEB'}], documentRefs: [{id: 'r_1', summaryHash: 'h1'}],
  areas: [{area: 'accounting', status: 'pass', sourceIds: ['S_UP']}, {area: 'outlook', status: 'pass', sourceIds: ['S_WEB']}]};
let u = reportUsage(review, report);
assert.equal(u.used, true);
assert.deepEqual(u.areas.map((a: any) => a.area), ['accounting'], 'Only areas citing the uploaded report are listed');
assert.equal(u.current, false, 'A review made from an older summary of the report is marked out of date');
u = reportUsage({...review, documentRefs: [{id: 'r_1', summaryHash: 'h2'}]}, report);
assert.equal(u.current, true);
assert.equal(reportUsage(undefined, report).used, false);
assert.equal(money(197792.78e7, 'INR'), '₹1,97,793 Cr', 'Indian figures are shown in crores');
assert.equal(money(-2.5e9, 'USD'), '−$2.50B');
console.log('PASS: annual-report cross-check scales report units, applies per-metric tolerances, matches fiscal periods, never compares across currencies, and the usage panel lists only review areas citing the current report summary.');

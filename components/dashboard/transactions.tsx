'use client';

import { useState, useMemo } from 'react';
import { Search, Download, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { money } from './shared';
import type { ViewProps } from './types';

export default function TransactionsView({ data, portfolio }: ViewProps) {
  const [search, setSearch] = useState('');

  const transactions = useMemo(() => {
    return (data?.recent || [])
      .filter(
        (r: any) => portfolio === 'All portfolios' || r.Portfolio === portfolio
      )
      .filter((r: any) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (r.Ticker || '').toLowerCase().includes(q) ||
          (r.Portfolio || '').toLowerCase().includes(q) ||
          (r.TransactionType || '').toLowerCase().includes(q) ||
          (r.Note || '').toLowerCase().includes(q)
        );
      });
  }, [data, portfolio, search]);

  const csv = () => {
    const rows = [
      ['Date', 'Portfolio', 'Ticker', 'Type', 'Shares', 'Recorded cost', 'Note'],
      ...transactions.map((r: any) => [
        r.Date,
        r.Portfolio,
        r.Ticker,
        r.TransactionType,
        r.NoOfShares,
        r.CostPerShare,
        r.Note || '',
      ]),
    ];
    const blob = new Blob(
      [
        rows
          .map((r: any[]) =>
            r.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')
          )
          .join('\n'),
      ],
      { type: 'text/csv' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arthapalana-transactions-${portfolio.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Recent ledger activity <span className="count">{transactions.length}</span>
          </h2>
          <p>
            {data?.recordCount || 0} records in NocoDB · latest {transactions.length} shown
          </p>
        </div>
        <div className="table-tools">
          <label className="search">
            <Search size={15} />
            <input
              placeholder="Search ticker, note, type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="button" onClick={csv}>
            <Download size={14} />
            Export CSV
          </button>
          <span className="badge gray">READ ONLY</span>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Portfolio</th>
              <th>Ticker</th>
              <th>Type</th>
              <th className="num" style={{ textAlign: 'right' }}>Shares</th>
              <th className="num" style={{ textAlign: 'right' }}>Recorded cost</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((r: any) => {
              const isBuy =
                r.TransactionType === 'Buy' || r.TransactionType === 'Deposit';
              const currency =
                r.Ticker === 'CASH' ||
                (r.Ticker && (r.Ticker.endsWith('.NS') || r.Ticker.endsWith('.BO')))
                  ? 'INR'
                  : 'USD';

              return (
                <tr key={r.Id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.Date}</td>
                  <td>{r.Portfolio}</td>
                  <td>
                    <span className="symbol-avatar">
                      <strong>{r.Ticker}</strong>
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        'badge ' + (isBuy ? 'green' : 'amber')
                      }
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {isBuy ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                      {r.TransactionType}
                    </span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {r.NoOfShares?.toLocaleString('en-IN') || '—'}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {money(r.CostPerShare, currency)}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                    {r.Note || '—'}
                  </td>
                </tr>
              );
            })}
            {!transactions.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                  No transactions match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

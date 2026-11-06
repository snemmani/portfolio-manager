'use client';

import { useState } from 'react';
import { Search, Download } from 'lucide-react';
import { date, HoldingsTable } from './shared';
import { useHoldings } from './view-data';
import type { ViewProps } from './types';

export default function HoldingsView({
  data,
  portfolio,
  setSelected,
}: ViewProps) {
  const holdings = useHoldings(data, portfolio);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All actions');

  const visible = holdings.filter(
    (h: any) => filter === 'All actions' || h.action === filter
  );

  const csv = () => {
    const rows = [
      [
        'Portfolio',
        'Ticker',
        'Shares',
        'Price',
        'Currency',
        'Value INR',
        'Weight %',
        'Action',
        'Quote time',
      ],
      ...visible
        .filter((h: any) =>
          (h.ticker + ' ' + h.sector + ' ' + h.portfolio)
            .toLowerCase()
            .includes(search.toLowerCase())
        )
        .map((h: any) => [
          h.portfolio,
          h.ticker,
          h.shares,
          h.price,
          h.currency,
          h.value,
          h.weight,
          h.action,
          date(h.quote?.time),
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
    a.download = `arthapalana-holdings-${portfolio.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel holdings-panel">
      <div className="panel-heading">
        <div>
          <h2>
            Open positions <span className="count">{visible.length}</span>
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', margin: '4px 0 0' }}>
            Live positions across recorded portfolios with FIFO lots and historical trends.
          </p>
        </div>
        <div className="table-tools">
          <label className="search">
            <Search size={15} />
            <input
              placeholder="Ticker, sector, portfolio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All actions</option>
            {[...new Set(holdings.map((h: any) => h.action))].map((a: any) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <button className="button" onClick={csv}>
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>
      <HoldingsTable
        holdings={holdings}
        setSelected={setSelected}
        search={search}
        filter={filter}
      />
    </section>
  );
}

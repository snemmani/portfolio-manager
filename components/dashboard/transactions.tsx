'use client';

import { useState, useMemo } from 'react';
import { Search, Download } from 'lucide-react';
import type { ViewProps } from './types';
import { Panel, Empty } from '../terminal/ui';
import { px, qty, symbol } from '../terminal/format';
import { cn } from '@/lib/utils';

const TYPE: Record<string, string> = {
  Buy: 'text-gain',
  Deposit: 'text-gain',
  Sell: 'text-loss',
  Withdrawal: 'text-loss',
};

export default function TransactionsView({ data, portfolio }: ViewProps) {
  const [search, setSearch] = useState('');
  const transactions = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.recent || []).filter(
      (r: any) =>
        (portfolio === 'All portfolios' || r.Portfolio === portfolio) &&
        (!q || `${r.Ticker} ${r.Portfolio} ${r.TransactionType} ${r.Note || ''}`.toLowerCase().includes(q)),
    );
  }, [data, portfolio, search]);

  const csv = () => {
    const rows = [
      ['Date', 'Portfolio', 'Ticker', 'Type', 'Shares', 'Recorded cost', 'Note'],
      ...transactions.map((r: any) => [r.Date, r.Portfolio, r.Ticker, r.TransactionType, r.NoOfShares, r.CostPerShare, r.Note || '']),
    ];
    const blob = new Blob([rows.map((r: any[]) => r.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arthapalana-transactions-${portfolio.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="Ledger"
      meta={`${transactions.length} recent of ${data?.recordCount || 0} · read-only`}
      flush
      actions={
        <>
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticker, type, note…" className="h-7 w-48 rounded-md border border-line bg-background pr-2 pl-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <button onClick={csv} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-xs text-muted-foreground hover:bg-hover hover:text-foreground">
            <Download className="size-3.5" /> CSV
          </button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="h-8 border-b border-line bg-raised text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="px-3 font-semibold">Date</th>
              <th className="hidden px-2 font-semibold sm:table-cell">Portfolio</th>
              <th className="px-2 font-semibold">Ticker</th>
              <th className="px-2 font-semibold">Type</th>
              <th className="px-2 text-right font-semibold">Qty</th>
              <th className="px-2 text-right font-semibold">Cost</th>
              <th className="hidden px-3 font-semibold md:table-cell">Note</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((r: any) => {
              const currency = r.Ticker === 'CASH' || /\.(NS|BO)$/.test(r.Ticker || '') ? 'INR' : 'USD';
              return (
                <tr key={r.Id} className="h-9 border-b border-line/70 last:border-0 hover:bg-hover">
                  <td className="px-3 font-mono whitespace-nowrap text-muted-foreground">{r.Date}</td>
                  <td className="hidden px-2 text-muted-foreground sm:table-cell">{r.Portfolio}</td>
                  <td className="px-2 font-mono font-semibold">{symbol(r.Ticker)}</td>
                  <td className={cn('px-2 text-xs font-semibold uppercase', TYPE[r.TransactionType] || 'text-muted-foreground')}>{r.TransactionType}</td>
                  <td className="px-2 text-right font-mono tabular-nums">{qty(r.NoOfShares)}</td>
                  <td className="px-2 text-right font-mono tabular-nums">{px(r.CostPerShare, currency)}</td>
                  <td className="hidden max-w-[24rem] truncate px-3 text-xs text-muted-foreground md:table-cell" title={r.Note}>
                    {r.Note || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!transactions.length && <Empty>No transactions match.</Empty>}
    </Panel>
  );
}

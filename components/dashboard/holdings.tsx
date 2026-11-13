'use client';

import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { date } from './shared';
import { useHoldings } from './view-data';
import type { ViewProps } from './types';
import { HoldingsGrid } from '../terminal/holdings-grid';
import { Panel, Segmented } from '../terminal/ui';
import { actionLabel } from '../../lib/recommendation-order';
import { inr } from '../terminal/format';

const ORDER = ['Trim', 'Trim review', 'Exit review', 'Profit review', 'Watch', 'Add candidate', 'Hold', 'Locked'];

export default function HoldingsView({ data, portfolio, setSelected }: ViewProps) {
  const holdings = useHoldings(data, portfolio);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const h of holdings) c[h.action] = (c[h.action] || 0) + 1;
    return c;
  }, [holdings]);
  const actions = Object.keys(counts).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const visible = filter === 'All' ? holdings : holdings.filter((h: any) => h.action === filter);
  const value = visible.reduce((n: number, h: any) => n + (h.value || 0), 0);

  const csv = () => {
    const q = search.toLowerCase();
    const rows = [
      ['Portfolio', 'Ticker', 'Shares', 'Price', 'Currency', 'Value INR', 'Weight %', 'Action', 'Quote time'],
      ...visible
        .filter((h: any) => `${h.ticker} ${h.sector} ${h.portfolio}`.toLowerCase().includes(q))
        .map((h: any) => [h.portfolio, h.ticker, h.shares, h.price, h.currency, h.value, h.weight, h.action==='Add candidate'?(h.purchaseStep?.label||'Checking next step…'):actionLabel(h.action), date(h.quote?.time)]),
    ];
    const blob = new Blob([rows.map((r: any[]) => r.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arthapalana-holdings-${portfolio.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="Open positions"
      meta={`${visible.length} · ${inr(value)}`}
      flush
      actions={
        <>
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticker, sector, portfolio…"
              className="h-7 w-52 rounded-md border border-line bg-background pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <button onClick={csv} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-panel px-2 text-xs text-muted-foreground hover:bg-hover hover:text-foreground">
            <Download className="size-3.5" /> CSV
          </button>
        </>
      }
    >
      <div className="no-scrollbar overflow-x-auto border-b border-line px-3 py-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[{ value: 'All', label: 'All', count: holdings.length }, ...actions.map((a) => ({ value: a, label: a==='Add candidate'?'Screened holdings':actionLabel(a), count: counts[a] }))]}
          className="flex-nowrap"
        />
      </div>
      <HoldingsGrid holdings={visible} onSelect={setSelected} search={search} />
    </Panel>
  );
}

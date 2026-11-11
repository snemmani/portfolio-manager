'use client';

import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type RowData,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, LockKeyhole } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inr, px, pct, qty, tone, symbol } from './format';
import { GateGlyphs, SignalBadge, Sparkline, ValuePct, WeightBar, Empty } from './ui';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    num?: boolean;
    className?: string;
  }
}

type H = any;
const col = createColumnHelper<H>();
const returnPct = (h: H) => (h.invested ? ((h.unrealised || 0) / h.invested) * 100 : null);

/** Dense, sortable holdings grid. Columns drop away by breakpoint; phones get stacked rows. */
export function HoldingsGrid({
  holdings,
  onSelect,
  search = '',
  limit,
  footer,
}: {
  holdings: H[];
  onSelect: (h: H) => void;
  search?: string;
  limit?: number;
  footer?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'value', desc: true }]);
  const columns = useMemo(
    () => [
      col.accessor('ticker', {
        header: 'Symbol',
        cell: ({ row: { original: h } }) => (
          <span className="flex min-w-0 items-center gap-1.5" title={h.sector}>
            <span className="font-mono font-semibold text-foreground">{symbol(h.ticker)}</span>
            {h.nonDiscretionary && <LockKeyhole className="size-3 text-muted-foreground" aria-label="Locked plan" />}
            {h.quote?.stale && <span className="font-mono text-[10px] text-warn">DELAYED</span>}
          </span>
        ),
        meta: { className: 'pl-3' },
      }),
      col.accessor('portfolio', {
        header: 'Portfolio',
        cell: (c) => <span className="truncate text-muted-foreground">{c.getValue()}</span>,
        meta: { className: 'hidden md:table-cell' },
      }),
      col.accessor('sector', {
        header: 'Sector',
        cell: (c) => <span className="truncate text-muted-foreground">{c.getValue()}</span>,
        meta: { className: 'hidden 2xl:table-cell' },
      }),
      col.accessor('shares', { header: 'Qty', cell: (c) => qty(c.getValue()), meta: { num: true, className: 'hidden xl:table-cell' } }),
      col.accessor('price', { header: 'Price', cell: ({ row: { original: h } }) => px(h.price, h.currency), meta: { num: true, className: 'hidden lg:table-cell' } }),
      col.accessor('value', { header: 'Value', cell: (c) => <span className="text-foreground">{inr(c.getValue())}</span>, meta: { num: true } }),
      col.accessor('unrealised', {
        header: 'P&L',
        cell: (c) => <span className={tone(c.getValue())}>{inr(c.getValue(), { signed: true })}</span>,
        meta: { num: true, className: 'hidden lg:table-cell' },
      }),
      col.accessor(returnPct, {
        id: 'return',
        header: 'P&L %',
        cell: (c) => <span className={tone(c.getValue())}>{pct(c.getValue())}</span>,
        meta: { num: true },
      }),
      col.accessor('weight', { header: 'Weight', cell: (c) => <WeightBar weight={c.getValue()} />, meta: { num: true } }),
      col.accessor('action', { header: 'Signal', cell: (c) => <SignalBadge action={c.getValue()} />, meta: { className: 'hidden md:table-cell' } }),
      col.display({ id: 'gates', header: 'Gates', cell: ({ row: { original: h } }) => <GateGlyphs scorecard={h.scorecard} />, meta: { className: 'hidden md:table-cell' } }),
      col.accessor((h) => (h.scorecard?.intrinsic?.value ? h.price / h.scorecard.intrinsic.value : null), {
        id: 'valuePct',
        header: 'P / Value',
        cell: ({ row: { original: h } }) => <ValuePct price={h.price} scorecard={h.scorecard} />,
        meta: { num: true, className: 'hidden xl:table-cell' },
        sortUndefined: 'last',
      }),
      col.display({ id: 'trend', header: '1Y', cell: ({ row: { original: h } }) => <Sparkline points={h.quote?.history || []} />, meta: { className: 'hidden lg:table-cell pr-3' } }),
    ],
    [],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? holdings.filter((h) => `${h.ticker} ${h.sector} ${h.portfolio} ${h.action}`.toLowerCase().includes(q)) : holdings;
  }, [holdings, search]);
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: true,
  });
  const rows = table.getRowModel().rows.slice(0, limit ?? undefined);

  return (
    <div>
      {/* Desktop and tablet: table */}
      <div className="hidden overflow-x-auto sm:block lg:overflow-x-visible">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((header) => {
                  const meta: any = header.column.columnDef.meta || {};
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'h-8 whitespace-nowrap border-b border-line bg-raised px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground lg:sticky lg:top-12 lg:z-10',
                        meta.num ? 'text-right' : 'text-left',
                        meta.className,
                      )}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', sorted && 'text-foreground')}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'desc' ? <ArrowDown className="size-3 text-brand" /> : sorted === 'asc' ? <ArrowUp className="size-3 text-brand" /> : null}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => onSelect(row.original)}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(row.original)}
                aria-label={`Open ${row.original.ticker} in ${row.original.portfolio}`}
                className="h-9 cursor-pointer border-b border-line/70 outline-none last:border-0 hover:bg-hover focus-visible:bg-hover focus-visible:shadow-[inset_2px_0_0_var(--t-accent)]"
              >
                {row.getVisibleCells().map((cell) => {
                  const meta: any = cell.column.columnDef.meta || {};
                  return (
                    <td key={cell.id} className={cn('max-w-48 px-2 align-middle', meta.num && 'text-right font-mono tabular-nums', meta.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked rows */}
      <ul className="divide-y divide-line sm:hidden">
        {rows.map(({ original: h, id }) => (
          <li key={id}>
            <button onClick={() => onSelect(h)} className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2.5 text-left active:bg-hover">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="font-mono font-semibold">{symbol(h.ticker)}</span>
                {h.nonDiscretionary && <LockKeyhole className="size-3 text-muted-foreground" />}
              </span>
              <span className="text-right font-mono tabular-nums">{inr(h.value)}</span>
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{h.portfolio}</span>
                <SignalBadge action={h.action} />
                <GateGlyphs scorecard={h.scorecard} />
              </span>
              <span className={cn('text-right font-mono text-xs tabular-nums', tone(returnPct(h)))}>
                {pct(returnPct(h))} · {(h.weight ?? 0).toFixed(1)}%
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!rows.length && <Empty>No holdings match.</Empty>}
      {footer}
    </div>
  );
}

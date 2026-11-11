'use client';

import { useMemo } from 'react';
import { Activity, BarChart3, BookOpen, Clock, LayoutDashboard, Settings, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { inr, pct, symbol, tone } from './format';
import { SignalBadge } from './ui';
import { cn } from '@/lib/utils';

const PAGES: [any, string, string][] = [
  [LayoutDashboard, 'Overview', 'Overview'],
  [Sparkles, 'Recommendations', 'Decisions'],
  [BarChart3, 'Holdings', 'Holdings'],
  [Wallet, 'Deploy cash', 'Deploy cash'],
  [Clock, 'Transactions', 'Transactions'],
  [Activity, 'AI reviews', 'AI reviews'],
  [BookOpen, 'Annual reports', 'Annual reports'],
  [ShieldCheck, 'Framework', 'Investment framework'],
  [Settings, 'Settings', 'Settings'],
];

/** Ctrl/Cmd+K: jump to a page or open any holding. */
export function CommandPalette({
  open,
  onOpenChange,
  holdings,
  onNavigate,
  onSelectHolding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holdings: any[];
  onNavigate: (view: string) => void;
  onSelectHolding: (h: any) => void;
}) {
  const sorted = useMemo(() => [...holdings].sort((a, b) => (b.value || 0) - (a.value || 0)), [holdings]);
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page or a holding" className="top-[20%] translate-y-0 border-line bg-panel sm:max-w-xl">
      <CommandInput placeholder="Stock, portfolio or page…" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {sorted.length > 0 && (
          <CommandGroup heading="Holdings">
            {sorted.map((h) => {
              const r = h.invested ? ((h.unrealised || 0) / h.invested) * 100 : null;
              return (
                <CommandItem key={h.portfolio + h.ticker} value={`${h.ticker} ${symbol(h.ticker)} ${h.portfolio} ${h.sector}`} onSelect={() => run(() => onSelectHolding(h))} className="gap-3">
                  <span className="w-28 truncate font-mono font-semibold">{symbol(h.ticker)}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">{h.portfolio}</span>
                  <SignalBadge action={h.action} />
                  <span className="w-16 text-right font-mono text-xs tabular-nums">{inr(h.value)}</span>
                  <span className={cn('w-14 text-right font-mono text-xs tabular-nums', tone(r))}>{pct(r)}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        <CommandGroup heading="Pages">
          {PAGES.map(([Icon, view, label]) => (
            <CommandItem key={view} value={`page ${label}`} onSelect={() => run(() => onNavigate(view))}>
              <Icon />
              {label}
              <CommandShortcut>page</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

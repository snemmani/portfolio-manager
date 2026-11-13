'use client';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  LayoutDashboard,
  BarChart3,
  Sparkles,
  Wallet,
  Clock,
  ShieldCheck,
  Settings,
  MoreHorizontal,
  RefreshCw,
  AlertTriangle,
  Search,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '../../lib/client/use-api';
import { invalidateResources } from '../../lib/client/resource-store';
import { withHoldingSteps } from '../../lib/holding-steps';
import { decisionAction } from '../../lib/trade-policy';
import { date } from './shared';
import AppClock from './clock';
import ThemeSelector from './theme';
import ResearchActivity from '../research/activity';
import { ModuleBoundary, ModuleLoading } from './resilience';
import { CommandPalette } from '../terminal/command-palette';
import { pct } from '../terminal/format';

const modules: Record<string, any> = {
  Overview: lazy(() => import('./overview')),
  Holdings: lazy(() => import('./holdings')),
  Recommendations: lazy(() => import('./recommendations')),
  'Deploy cash': lazy(() => import('./deploy')),
  Transactions: lazy(() => import('./transactions')),
  Framework: lazy(() => import('./framework')),
  Settings: lazy(() => import('./settings')),
  'AI reviews': lazy(() => import('./research')),
  'Annual reports': lazy(() => import('./reports')),
};

const Drawer = lazy(() => import('./holding-drawer'));
const Execution = lazy(() => import('../execution-panel'));

export const paths: Record<string, string> = {
  Overview: '/',
  Holdings: '/holdings',
  Recommendations: '/recommendations',
  'Deploy cash': '/deploy-cash',
  Transactions: '/transactions',
  Framework: '/framework',
  Settings: '/settings',
  'AI reviews': '/research',
  'Annual reports': '/reports',
};

const titles: Record<string, string> = {
  Overview: 'Overview',
  Holdings: 'Holdings',
  Recommendations: 'Decisions',
  'Deploy cash': 'Deploy cash',
  Transactions: 'Transactions',
  Framework: 'Investment framework',
  Settings: 'Settings',
  'AI reviews': 'AI reviews',
  'Annual reports': 'Annual reports',
};

const subtitles: Record<string, string> = {
  Overview: 'Value, returns and what needs you across every portfolio.',
  Holdings: 'Every position with its Jarvis gates, weight and price against value.',
  Recommendations: 'Only what needs a decision. Mandatory checks block; warnings shrink the position.',
  'Deploy cash': 'Screened companies, their investment cases and what your cash can buy today.',
  Transactions: 'The read-only ledger behind every figure.',
  Framework: 'The mandatory checks, the warnings and how they size a position.',
  Settings: 'Research schedule, profit-taking rules and Discord alerts.',
  'AI reviews': 'Company research runs, their scope and what they concluded.',
  'Annual reports': 'Uploaded annual reports shared by every company review.',
};

export const NAV: { group: string; items: [any, string, string?][] }[] = [
  { group: 'Portfolio', items: [[LayoutDashboard, 'Overview'], [BarChart3, 'Holdings'], [Clock, 'Transactions']] },
  { group: 'Act', items: [[Sparkles, 'Recommendations', 'Decisions'], [Wallet, 'Deploy cash']] },
  { group: 'Research', items: [[Activity, 'AI reviews'], [BookOpen, 'Annual reports'], [ShieldCheck, 'Framework']] },
];

const INDEX_NAMES: Record<string, string> = { '^NSEI': 'NIFTY', '^BSESN': 'SENSEX', '^GSPC': 'S&P 500' };

function urlView(fallback: string) {
  const u = new URL(location.href);
  const query = u.searchParams.get('view');
  return (
    Object.keys(paths).find((v) => paths[v] === u.pathname && u.pathname !== '/') ||
    Object.keys(paths).find((v) => v.toLowerCase().replaceAll(' ', '-') === query) ||
    fallback
  );
}

const DECISION_ACTIONS = ['Trim', 'Trim review', 'Exit review', 'Profit review'];

export default function DashboardShell({ initialView = 'Overview' }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [portfolio, setPortfolio] = useState('All portfolios');
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [executionTarget, setExecutionTarget] = useState<any>(null);

  const needsPortfolio = !['Settings', 'Framework', 'AI reviews', 'Annual reports'].includes(view);
  const snapshot = useApi('/api/portfolio', { enabled: needsPortfolio, interval: 60000 });
  const reviewContext=useApi('/api/analysis?holdings=1',{enabled:needsPortfolio,interval:60000,timeout:20000});
  const data=useMemo(()=>withHoldingSteps(snapshot.data,reviewContext.error?{unavailable:true}:reviewContext.data),[snapshot.data,reviewContext.data,reviewContext.error]);
  const portfolios = data?.portfolios || [];
  const decisions = useMemo(
    () =>
      (data?.holdings || []).filter(
        (h: any) => (portfolio === 'All portfolios' || h.portfolio === portfolio) && DECISION_ACTIONS.includes(decisionAction(h)),
      ).length,
    [data, portfolio],
  );

  useEffect(() => {
    const sync = () => {
      setView(urlView(initialView));
      setPortfolio(new URL(location.href).searchParams.get('portfolio') || 'All portfolios');
      setSelected(null);
      setExecutionTarget(null);
    };
    sync();
    window.addEventListener('popstate', sync);
    const choose = (event: any) => selectPortfolio(event.detail);
    window.addEventListener('arthapalana-portfolio', choose);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('arthapalana-portfolio', choose);
      window.removeEventListener('keydown', key);
    };
  }, [initialView]);

  function changeUrl(nextView: string, name: string) {
    const u = new URL(paths[nextView], location.origin);
    if (name !== 'All portfolios') u.searchParams.set('portfolio', name);
    history.pushState({}, '', u.pathname + u.search);
  }
  function navigate(v: string) {
    setView(v);
    setSelected(null);
    setExecutionTarget(null);
    setMoreOpen(false);
    changeUrl(v, portfolio);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function selectPortfolio(name: string) {
    setPortfolio(name);
    setSelected(null);
    setExecutionTarget(null);
    changeUrl(urlView(view), name);
  }
  const showExecution = (ticker: string, portfolio?: string, budget?: string, allowExit = false, intent?: 'profit') => {
    setSelected(null);
    setExecutionTarget({ ticker, portfolio, budget, allowExit, intent });
  };
  const refresh = () => {
    if (needsPortfolio) void snapshot.refresh();
    invalidateResources(['/api/research/status']);
  };

  const View = modules[view] || modules.Overview;
  const link = (label: string, onClick: () => void) => ({
    href: paths[label],
    onClick: (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      onClick();
    },
  });

  return (
    <div className="min-h-screen bg-background font-sans text-foreground lg:grid lg:grid-cols-[208px_minmax(0,1fr)]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-line bg-panel lg:flex">
        <a {...link('Overview', () => navigate('Overview'))} className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <span className="grid size-6 place-items-center rounded-[5px] bg-brand font-mono text-[13px] font-bold text-primary-foreground">अ</span>
          <span className="font-mono text-[13px] font-semibold tracking-tight">arthapalana</span>
        </a>
        <nav className="flex-1 px-2 py-3">
          {NAV.map(({ group, items }) => (
            <div key={group} className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group}</div>
              {items.map(([Icon, label, short]) => (
                <a
                  key={label}
                  {...link(label, () => navigate(label))}
                  aria-current={view === label ? 'page' : undefined}
                  className={cn(
                    'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground',
                    view === label && 'bg-brand-soft font-medium text-brand hover:bg-brand-soft hover:text-brand',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{short || label}</span>
                  {label === 'Recommendations' && decisions > 0 && (
                    <span className="rounded-sm bg-warn-soft px-1.5 font-mono text-[10px] font-semibold text-warn">{decisions}</span>
                  )}
                </a>
              ))}
            </div>
          ))}
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Portfolios <span className="font-mono">{data ? portfolios.length : '—'}</span>
            </div>
            {[{ name: 'All portfolios', holdings: data?.holdings || [] }, ...portfolios].map((p: any) => (
              <button
                key={p.name}
                onClick={() => selectPortfolio(p.name)}
                className={cn(
                  'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground',
                  portfolio === p.name && 'text-foreground',
                )}
              >
                <span className={cn('size-1.5 rounded-full', portfolio === p.name ? 'bg-brand' : 'bg-line-strong')} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono text-[11px]">{p.holdings?.length ?? ''}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="border-t border-line p-2">
          <a
            {...link('Settings', () => navigate('Settings'))}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground',
              view === 'Settings' && 'bg-brand-soft text-brand',
            )}
          >
            <Settings className="size-4" /> Settings
          </a>
          <div className="mt-1 flex items-center gap-2 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', data ? 'bg-gain' : 'bg-line-strong')} />
            {data ? `Ledger synced ${date(data.asOf)}` : 'Ledger on demand'}
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
          <a {...link('Overview', () => navigate('Overview'))} className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-brand font-mono text-[13px] font-bold text-primary-foreground lg:hidden">
            अ
          </a>
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-4 overflow-x-auto font-mono text-[12px]">
            {(data?.indices || []).map((q: any) => {
              const change = q.price && q.previous ? (q.price / q.previous - 1) * 100 : null;
              return (
                <span key={q.ticker} className="flex shrink-0 items-baseline gap-1.5" title={`${q.stale ? 'Stale · ' : ''}${date(q.time)}`}>
                  <span className="text-muted-foreground">{INDEX_NAMES[q.ticker] || q.ticker}</span>
                  <span className="tabular-nums">{q.price?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '—'}</span>
                  <span className={cn('tabular-nums', (change || 0) >= 0 ? 'text-gain' : 'text-loss')}>{pct(change, { digits: 2 })}</span>
                </span>
              );
            })}
            {data?.fx && (
              <span className="flex shrink-0 items-baseline gap-1.5" title={date(data.fxTime)}>
                <span className="text-muted-foreground">USDINR</span>
                <span className="tabular-nums">{data.fx.toFixed(2)}</span>
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ModuleBoundary name="AI review status">
              <span className="hidden md:inline-flex">
                <ResearchActivity pill onOpen={() => navigate('AI reviews')} />
              </span>
            </ModuleBoundary>
            {needsPortfolio && (
              <label className="relative inline-flex items-center">
                <span className="sr-only">Portfolio</span>
                <select
                  value={portfolio}
                  onChange={(e) => selectPortfolio(e.target.value)}
                  className="h-7 max-w-40 appearance-none rounded-md border border-line bg-panel pr-7 pl-2 text-xs font-medium text-foreground outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option>All portfolios</option>
                  {portfolios.map((p: any) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
              </label>
            )}
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-7 items-center gap-2 rounded-md border border-line bg-panel px-2 text-xs text-muted-foreground hover:bg-hover hover:text-foreground sm:inline-flex"
              aria-label="Search stocks and pages"
            >
              <Search className="size-3.5" />
              <span className="hidden xl:inline">Search</span>
              <kbd className="rounded-sm border border-line px-1 font-mono text-[10px]">Ctrl K</kbd>
            </button>
            <button
              onClick={refresh}
              disabled={snapshot.loading && needsPortfolio}
              className="grid size-7 place-items-center rounded-md border border-line bg-panel text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-50"
              aria-label={needsPortfolio ? 'Refresh data' : 'Refresh status'}
              title={needsPortfolio ? 'Refresh data' : 'Refresh status'}
            >
              <RefreshCw className={cn('size-3.5', snapshot.loading && needsPortfolio && 'animate-spin')} />
            </button>
            <span className="hidden font-mono text-[11px] text-muted-foreground 2xl:inline">
              <AppClock />
            </span>
            <span className="hidden sm:inline-flex">
              <ThemeSelector />
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-3 pt-4 pb-24 sm:px-4 lg:px-6 lg:pb-10">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight">{titles[view]}</h1>
            <p className="text-xs text-muted-foreground">{subtitles[view]}</p>
            {needsPortfolio && portfolio !== 'All portfolios' && (
              <span className="rounded-sm border border-brand/40 bg-brand-soft px-1.5 font-mono text-[11px] text-brand">{portfolio}</span>
            )}
          </div>

          {needsPortfolio && snapshot.error && (
            <div role="alert" className="mb-3 flex items-center gap-3 rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-sm text-loss">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="flex-1">
                {snapshot.error}
                {data && ' Showing the previous portfolio snapshot.'}
              </span>
              <button onClick={snapshot.refresh} className="rounded-md border border-loss/40 px-2 py-0.5 text-xs font-medium hover:bg-loss/10">
                Retry
              </button>
            </div>
          )}
          {needsPortfolio && data?.warnings?.length > 0 && (
            <details className="mb-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
              <summary className="cursor-pointer font-medium">{data.warnings.length} data checks need attention</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {data.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          {needsPortfolio && !data ? (
            <section role="status" className="grid place-items-center rounded-md border border-line bg-panel px-4 py-16 text-center">
              <RefreshCw className="mb-3 size-6 animate-spin text-brand" />
              <h2 className="text-sm font-semibold">Connecting to the portfolio ledger</h2>
              <p className="mt-1 text-xs text-muted-foreground">Navigation and research status stay available while data loads.</p>
            </section>
          ) : (
            <ModuleBoundary key={view} name={view}>
              <Suspense fallback={<ModuleLoading />}>
                <div>
                  <View data={data} portfolio={portfolio} navigate={navigate} setSelected={setSelected} showExecution={showExecution} />
                </div>
              </Suspense>
            </ModuleBoundary>
          )}
        </main>
      </div>

      {/* Mobile: bottom tabs + More sheet */}
      {moreOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMoreOpen(false)} />}
      {moreOpen && (
        <nav aria-label="More pages" className="fixed inset-x-2 bottom-[calc(60px+env(safe-area-inset-bottom))] z-50 grid gap-0.5 rounded-lg border border-line bg-panel p-1.5 shadow-2xl lg:hidden">
          {(
            [
              [Clock, 'Transactions'],
              [Activity, 'AI reviews'],
              [BookOpen, 'Annual reports'],
              [ShieldCheck, 'Framework'],
              [Settings, 'Settings'],
            ] as any[]
          ).map(([Icon, label]) => (
            <a
              key={label}
              {...link(label, () => navigate(label))}
              aria-current={view === label ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-md px-3 py-3 text-[15px]', view === label ? 'bg-brand-soft font-medium text-brand' : 'text-foreground')}
            >
              <Icon className="size-[18px]" />
              {label}
            </a>
          ))}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeSelector />
          </div>
        </nav>
      )}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-line bg-panel/95 px-1 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {(
          [
            [LayoutDashboard, 'Overview'],
            [Sparkles, 'Recommendations', 'Decide'],
            [BarChart3, 'Holdings'],
            [Wallet, 'Deploy cash', 'Cash'],
          ] as any[]
        ).map(([Icon, label, short]) => (
          <a
            key={label}
            {...link(label, () => navigate(label))}
            aria-current={view === label ? 'page' : undefined}
            className={cn('relative grid justify-items-center gap-0.5 py-1 text-[11px]', view === label && !moreOpen ? 'font-semibold text-brand' : 'text-muted-foreground')}
          >
            <Icon className="size-[18px]" />
            {short || label}
            {label === 'Recommendations' && decisions > 0 && (
              <span className="absolute top-0 right-[calc(50%-18px)] rounded-sm bg-warn px-1 font-mono text-[9px] font-bold text-background">{decisions}</span>
            )}
          </a>
        ))}
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className={cn(
            'grid justify-items-center gap-0.5 py-1 text-[11px]',
            moreOpen || ['Transactions', 'AI reviews', 'Annual reports', 'Framework', 'Settings'].includes(view) ? 'font-semibold text-brand' : 'text-muted-foreground',
          )}
        >
          <MoreHorizontal className="size-[18px]" />
          More
        </button>
      </nav>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        holdings={data?.holdings || []}
        onNavigate={(v) => navigate(v)}
        onSelectHolding={(h) => setSelected(h)}
      />

      {selected && (
        <ModuleBoundary name="Holding details">
          <Suspense fallback={<ModuleLoading />}>
            <Drawer selected={data?.holdings?.find((h:any)=>h.ticker===selected.ticker&&h.portfolio===selected.portfolio)||selected} setSelected={setSelected} showExecution={showExecution} />
          </Suspense>
        </ModuleBoundary>
      )}
      {executionTarget && (
        <ModuleBoundary name="Price plan">
          <Suspense fallback={<ModuleLoading />}>
            <div>
              <Execution target={executionTarget} onClose={() => setExecutionTarget(null)} />
            </div>
          </Suspense>
        </ModuleBoundary>
      )}
    </div>
  );
}

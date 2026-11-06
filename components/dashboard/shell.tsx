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
  LockKeyhole,
  ChevronRight,
  Check,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { useApi } from '../../lib/client/use-api';
import { invalidateResources } from '../../lib/client/resource-store';
import { compact, percent, date } from './shared';
import AppClock from './clock';
import ThemeSelector from './theme';
import ResearchActivity from '../research/activity';
import { ModuleBoundary, ModuleLoading } from './resilience';

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

const paths: Record<string, string> = {
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
  Overview: 'Portfolio overview',
  Holdings: 'Your holdings',
  Recommendations: 'Today’s decisions',
  'Deploy cash': 'Deploy cash',
  Transactions: 'Transaction ledger',
  Framework: 'Investment framework',
  Settings: 'Desk configuration & alerts',
  'AI reviews': 'Research intelligence',
  'Annual reports': 'Annual report library',
};

const subtitles: Record<string, string> = {
  Overview: 'Value, returns and where your money sits across every portfolio.',
  Holdings: 'Every position with its Jarvis gates, weight and price against value.',
  Recommendations: 'Only what needs a decision. Mandatory checks block; warnings shrink the position.',
  'Deploy cash': 'Screened companies, their investment cases and what your cash can buy today.',
  Transactions: 'The read-only ledger behind every figure.',
  Framework: 'The mandatory checks, the warnings and how they size a position.',
  Settings: 'Research schedule, profit-taking rules and Discord alerts.',
  'AI reviews': 'Company research runs, their scope and what they concluded.',
  'Annual reports': 'Uploaded annual reports shared by every company review.',
};

function urlView(fallback: string) {
  const u = new URL(location.href);
  const query = u.searchParams.get('view');
  return (
    Object.keys(paths).find(
      (v) => paths[v] === u.pathname && u.pathname !== '/'
    ) ||
    Object.keys(paths).find((v) => v.toLowerCase().replaceAll(' ', '-') === query) ||
    fallback
  );
}

export default function DashboardShell({
  initialView = 'Overview',
}: {
  initialView?: string;
}) {
  const [view, setView] = useState(initialView);
  const [portfolio, setPortfolio] = useState('All portfolios');
  const [selected, setSelected] = useState<any>(null);
  const [executionTarget, setExecutionTarget] = useState<any>(null);

  const needsPortfolio = ![
    'Settings',
    'Framework',
    'AI reviews',
    'Annual reports',
  ].includes(view);
  const snapshot = useApi('/api/portfolio', {
    enabled: needsPortfolio,
    interval: 300000,
  });
  const data = snapshot.data;
  const portfolios = data?.portfolios || [];
  const holdings = useMemo(
    () =>
      data?.holdings.filter(
        (h: any) => portfolio === 'All portfolios' || h.portfolio === portfolio
      ) || [],
    [data, portfolio]
  );
  const totals =
    portfolios.find((p: any) => p.name === portfolio) || data?.totals;
  const priorities = useMemo(
    () =>
      holdings.filter((h: any) =>
        [
          'Trim',
          'Trim review',
          'Exit review',
          'Profit review',
        ].includes(h.action)
      ),
    [holdings]
  );

  useEffect(() => {
    const sync = () => {
      setView(urlView(initialView));
      setPortfolio(
        new URL(location.href).searchParams.get('portfolio') || 'All portfolios'
      );
      setSelected(null);
      setExecutionTarget(null);
    };
    sync();
    window.addEventListener('popstate', sync);
    const choose = (event: any) => selectPortfolio(event.detail);
    window.addEventListener('arthapalana-portfolio', choose);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('arthapalana-portfolio', choose);
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
    changeUrl(v, portfolio);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function selectPortfolio(name: string) {
    setPortfolio(name);
    setSelected(null);
    setExecutionTarget(null);
    changeUrl(urlView(view), name);
  }

  const showExecution = (
    ticker: string,
    portfolio?: string,
    budget?: string,
    allowExit = false
  ) => {
    setSelected(null);
    setExecutionTarget({ ticker, portfolio, budget, allowExit });
  };

  const View = modules[view] || modules.Overview;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('Overview');
          }}
        >
          <span className="brand-mark">
            <Activity size={20} />
          </span>
          <span>
            artha<span className="brand-light">palana</span>
            <small>PORTFOLIO INTELLIGENCE</small>
          </span>
        </a>

        <div className="workspace">
          <span className="avatar">SN</span>
          <div>
            <strong>Investment Desk</strong>
            <small>
              Private workspace <LockKeyhole size={10} />
            </small>
          </div>
        </div>

        {/* Group 1: Portfolio Hub */}
        <div className="nav-label">PORTFOLIO HUB</div>
        <nav>
          {[
            [LayoutDashboard, 'Overview'],
            [BarChart3, 'Holdings'],
            [Clock, 'Transactions'],
          ].map(([Icon, label]: any) => (
            <a
              className={
                'dashboard-nav-link ' + (view === label ? 'nav-active' : '')
              }
              aria-current={view === label ? 'page' : undefined}
              href={paths[label]}
              key={label}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate(label);
              }}
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </nav>

        {/* Group 2: Decision & Action */}
        <div className="nav-label" style={{ marginTop: '18px' }}>
          DECISION & ACTION
        </div>
        <nav>
          {[
            [Sparkles, 'Recommendations', 'Today’s decisions'],
            [Wallet, 'Deploy cash'],
          ].map(([Icon, label, display]: any) => (
            <a
              className={
                'dashboard-nav-link ' + (view === label ? 'nav-active' : '')
              }
              aria-current={view === label ? 'page' : undefined}
              href={paths[label]}
              key={label}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate(label);
              }}
            >
              <Icon size={16} />
              {display || label}
            </a>
          ))}
        </nav>

        {/* Group 3: Research Lab */}
        <div className="nav-label" style={{ marginTop: '18px' }}>
          RESEARCH LAB
        </div>
        <nav>
          {[
            [Activity, 'AI reviews'],
            [BookOpen, 'Annual reports'],
          ].map(([Icon, label]: any) => (
            <a
              className={
                'dashboard-nav-link ' + (view === label ? 'nav-active' : '')
              }
              aria-current={view === label ? 'page' : undefined}
              href={paths[label]}
              key={label}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate(label);
              }}
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </nav>

        {/* Portfolio quick filter */}
        <div className="nav-label portfolio-label">
          PORTFOLIOS <span>{data ? portfolios.length : '—'}</span>
        </div>
        <button
          className={
            'portfolio-nav ' + (portfolio === 'All portfolios' ? 'active' : '')
          }
          onClick={() => selectPortfolio('All portfolios')}
        >
          <span className="portfolio-dot all" />
          All portfolios
          <span className="chevron">
            {portfolio === 'All portfolios' && <Check size={13} />}
          </span>
        </button>
        {portfolios.map((p: any, i: number) => (
          <button
            key={p.name}
            className={'portfolio-nav ' + (portfolio === p.name ? 'active' : '')}
            onClick={() => selectPortfolio(p.name)}
          >
            <span className={'portfolio-dot dot-' + (i % 7)} />
            {p.name}
            <span className="chevron">{p.holdings.length}</span>
          </button>
        ))}

        <div className="sidebar-bottom">
          <button
            onClick={() => navigate('Framework')}
            className={view === 'Framework' ? 'active' : ''}
          >
            <ShieldCheck size={16} />
            Investment framework
          </button>
          <button
            onClick={() => navigate('Settings')}
            className={view === 'Settings' ? 'active' : ''}
          >
            <Settings size={16} />
            Desk settings
          </button>
          <div className="source-pill">
            <div>
              <span className="status-dot" />
              {data ? 'Portfolio connected' : 'Connecting on demand'}
            </div>
            <small>Read-only institutional ledger</small>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{view}</strong>
          </div>
          <div className="top-actions">
            <AppClock />
            <ThemeSelector />
            <span className="private">
              <LockKeyhole size={11} /> Private
            </span>
          </div>
        </header>

        <main>
          {needsPortfolio && (
            <div className="market-strip">
              {(
                data?.indices || [
                  { ticker: '^NSEI' },
                  { ticker: '^BSESN' },
                  { ticker: '^GSPC' },
                ]
              ).map((q: any) => {
                const change =
                  q.price && q.previous ? (q.price / q.previous - 1) * 100 : null;
                return (
                  <div key={q.ticker}>
                    <small>
                      {
                        {
                          '^NSEI': 'NIFTY 50',
                          '^BSESN': 'SENSEX',
                          '^GSPC': 'S&P 500',
                        }[q.ticker as string] || q.ticker
                      }
                    </small>
                    <strong>
                      {q.price?.toLocaleString('en-IN', {
                        maximumFractionDigits: 2,
                      }) || '—'}
                    </strong>
                    <span className={(change || 0) >= 0 ? 'positive' : 'negative'}>
                      {percent(change)}
                    </span>
                    <span className="market-time">
                      {q.stale ? 'Stale · ' : ''}
                      {date(q.time)}
                    </span>
                  </div>
                );
              })}
              <div>
                <small>USD / INR</small>
                <strong>{data?.fx?.toFixed(4) || '—'}</strong>
                <span className="market-time">{date(data?.fxTime)}</span>
              </div>
              <div className="market-note">
                <Activity size={14} />
                <span>
                  Market quotes<small>Delayed market feeds</small>
                </span>
              </div>
            </div>
          )}

          <div className="page-heading">
            <div>
              <h1>{titles[view]}</h1>
              <p>{subtitles[view]}</p>
            </div>
            <button
              className="button"
              disabled={snapshot.loading && needsPortfolio}
              onClick={() => {
                if (needsPortfolio) void snapshot.refresh();
                invalidateResources(['/api/research/status']);
              }}
            >
              <RefreshCw
                size={14}
                className={snapshot.loading && needsPortfolio ? 'spin' : ''}
              />
              {needsPortfolio ? 'Refresh data' : 'Refresh status'}
            </button>
          </div>

          <ModuleBoundary name="AI review status">
            <ResearchActivity onOpen={() => navigate('AI reviews')} />
          </ModuleBoundary>

          {needsPortfolio && snapshot.error && (
            <div className="alert error" role="alert">
              <AlertTriangle size={18} />
              <div>
                {snapshot.error}
                {data && ' Showing previous portfolio snapshot.'}
              </div>
              <button
                className="button"
                style={{ marginLeft: 'auto' }}
                onClick={snapshot.refresh}
              >
                Retry
              </button>
            </div>
          )}

          {needsPortfolio && data?.warnings?.length > 0 && (
            <details className="data-warnings">
              <summary>
                {data.warnings.length} data checks need attention
              </summary>
              <div style={{ marginTop: '8px', paddingLeft: '8px' }}>
                {data.warnings.map((warning: string, i: number) => (
                  <p key={i} style={{ margin: '4px 0' }}>
                    {warning}
                  </p>
                ))}
              </div>
            </details>
          )}

          {/* Portfolio controls: active portfolio picker + sync status */}
          {needsPortfolio && (
            <div className="portfolio-controls">
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <label
                  htmlFor="portfolio-select"
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Portfolio:
                </label>
                <select
                  id="portfolio-select"
                  aria-label="Selected portfolio"
                  value={portfolio}
                  onChange={(e) => selectPortfolio(e.target.value)}
                >
                  <option>All portfolios</option>
                  {portfolios.map((p: any) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <span className="sync-time">
                {data ? `Synced ${date(data.asOf)}` : 'Connecting to NocoDB…'}
              </span>
            </div>
          )}

          {/* Render the 4 KPI stat cards ONLY on Overview to keep other pages focused */}
          {needsPortfolio && view === 'Overview' && (
            <div className="stats-grid">
              <div className="stat-card">
                <small>
                  Total portfolio value <Wallet size={14} />
                </small>
                <strong>{compact(totals?.value)}</strong>
                <span>
                  {totals?.unpriced
                    ? 'Partial valuation · missing prices'
                    : 'Equities + recorded cash'}
                </span>
              </div>
              <div className="stat-card">
                <small>
                  Unrealised return <TrendingUp size={14} />
                </small>
                <strong
                  className={
                    totals?.equity - totals?.invested >= 0
                      ? 'positive'
                      : 'negative'
                  }
                >
                  {compact(
                    totals && !totals.unpriced
                      ? totals.equity - totals.invested
                      : null
                  )}
                </strong>
                <span>
                  FIFO · current FX ·{' '}
                  {totals?.invested && !totals?.unpriced
                    ? percent((totals.equity / totals.invested - 1) * 100)
                    : '—'}
                </span>
              </div>
              <div className="stat-card">
                <small>
                  Available cash <Wallet size={14} />
                </small>
                <strong>{compact(totals?.cash)}</strong>
                <button
                  className="text-link"
                  onClick={() => navigate('Deploy cash')}
                  style={{ color: 'var(--accent)', fontWeight: 600 }}
                >
                  Deploy cash <ArrowRight size={13} />
                </button>
              </div>
              <div className="stat-card">
                <small>
                  Decisions waiting <Sparkles size={14} />
                </small>
                <strong>{data ? priorities.length : '—'}</strong>
                <span>Trims, exit and profit reviews</span>
              </div>
            </div>
          )}

          {needsPortfolio && !data ? (
            <section
              className="loading-state"
              role="status"
              style={{ padding: '60px 20px', textAlign: 'center' }}
            >
              <RefreshCw
                size={28}
                className="spin"
                style={{ margin: '0 auto 16px', color: 'var(--accent)' }}
              />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                Connecting to portfolio ledger
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
                Research status and navigation remain available while data loads.
              </p>
            </section>
          ) : (
            <ModuleBoundary key={view} name={view}>
              <Suspense fallback={<ModuleLoading />}>
                <View
                  data={data}
                  portfolio={portfolio}
                  navigate={navigate}
                  setSelected={setSelected}
                  showExecution={showExecution}
                />
              </Suspense>
            </ModuleBoundary>
          )}

          <footer
            style={{
              borderTop: '1px solid var(--line)',
              marginTop: '40px',
              paddingTop: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--text-xs)',
              color: 'var(--muted)',
            }}
          >
            <span>Arthapalana · Institutional-Grade Portfolio Intelligence</span>
            <span>NocoDB ledger · Yahoo Finance feeds · Jarvis framework</span>
          </footer>
        </main>
      </div>

      <nav className="mobile-tabs" aria-label="Primary">
        {([
          [LayoutDashboard, 'Overview'],
          [Sparkles, 'Recommendations', 'Decide'],
          [BarChart3, 'Holdings'],
          [Wallet, 'Deploy cash', 'Cash'],
          [Settings, 'Settings'],
        ] as any[]).map(([Icon, label, short]) => (
          <a
            key={label}
            href={paths[label]}
            className={view === label ? 'active' : ''}
            aria-current={view === label ? 'page' : undefined}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              navigate(label);
            }}
          >
            <Icon size={18} />
            <span>{short || label}</span>
          </a>
        ))}
      </nav>

      {selected && (
        <ModuleBoundary name="Holding details">
          <Suspense fallback={<ModuleLoading />}>
            <Drawer
              selected={selected}
              setSelected={setSelected}
              showExecution={showExecution}
            />
          </Suspense>
        </ModuleBoundary>
      )}

      {executionTarget && (
        <ModuleBoundary name="Price plan">
          <Suspense fallback={<ModuleLoading />}>
            <Execution
              target={executionTarget}
              onClose={() => setExecutionTarget(null)}
            />
          </Suspense>
        </ModuleBoundary>
      )}
    </div>
  );
}

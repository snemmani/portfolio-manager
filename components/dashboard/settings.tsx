'use client';

import { useState, useEffect } from 'react';
import { Sparkles, LockKeyhole, Activity, ExternalLink } from 'lucide-react';
import { date } from './shared';
import { useApi } from '../../lib/client/use-api';
import { queueResearch } from './view-data';
import { useResearchStatus } from '../research/activity';
import AlertSettings from '../alert-settings';
import TradeControls from '../trade-controls';
import MarketStatus from '../market-status';
import { Panel } from '../terminal/ui';
import { cn } from '@/lib/utils';

const btn = 'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:opacity-50';

export default function SettingsView() {
  const settings = useApi('/api/settings', { interval: 300000 });
  const status = useResearchStatus().data;
  const [config, setConfigValue] = useState<any>({ model: '', enabled: true });
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (settings.data && !dirty) setConfigValue(settings.data);
  }, [settings.data, dirty]);
  const setConfig = (v: any) => {
    setDirty(true);
    setConfigValue(v);
  };
  const runner = status?.runner || settings.data?.runner;

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, enabled: config.enabled, intervalMinutes: 120 }),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setNotice(d.message);
      if (await settings.refresh()) setDirty(false);
      window.dispatchEvent(new Event('arthapalana-research-change'));
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setSaving(false);
    }
  };
  const queue = async () => {
    setAnalyzing(true);
    try {
      setNotice((await queueResearch()).message);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 gap-3">
        {settings.error && (
          <div className="flex items-center gap-3 rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-sm text-loss">
            {settings.error}
            <button onClick={settings.refresh} className="ml-auto underline">
              Retry
            </button>
          </div>
        )}

        <Panel title={<span className="flex items-center gap-2"><Sparkles className="size-3.5 text-brand" /> AI research runner</span>}>
          <div className="grid gap-4">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line text-xs sm:grid-cols-4 [&>div]:bg-raised [&>div]:p-2.5">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Status</dt>
                <dd className={cn('mt-0.5 flex items-center gap-1.5 font-mono font-semibold', runner?.online ? 'text-gain' : 'text-warn')}>
                  <span className={cn('size-1.5 rounded-full', runner?.online ? 'bg-gain' : 'bg-warn')} />
                  {runner?.online ? 'ONLINE' : 'OFFLINE'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Auth</dt>
                <dd className="mt-0.5 truncate font-mono">{runner?.auth_mode === 'antigravity' ? 'Antigravity' : runner?.auth_mode || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Heartbeat</dt>
                <dd className="mt-0.5 truncate font-mono">{date(runner?.heartbeat_at)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Last report</dt>
                <dd className="mt-0.5 truncate font-mono">{date(runner?.last_completed_at)}</dd>
              </div>
            </dl>
            {runner?.machine && <p className="-mt-2 font-mono text-[11px] text-muted-foreground">Machine {runner.machine}</p>}
            {runner?.last_error && <p className="rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-loss">{runner.last_error}</p>}

            <label className="grid gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Model override (optional)</span>
              <input
                placeholder="gemini-3.8-flash-high (default)"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                className="h-8 rounded-md border border-line bg-background px-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-[11px] text-muted-foreground">Must be available to your Antigravity account. Unavailable models fail; they never switch to API billing.</span>
            </label>

            <div className="flex items-start gap-3 rounded-md border border-line p-3">
              <div className="flex-1">
                <div className="text-sm font-semibold">Automatic company research</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Weekdays at 9:15, 11:15, 13:15 and 15:15 IST. Buy and trim calculations run independently every 15 minutes; manual research is always available.
                </p>
                <p className="mt-1.5 font-mono text-[11px]">
                  {!config.enabled ? (
                    <span className="text-warn">Paused</span>
                  ) : config.schedule?.automaticAllowed ? (
                    <span className="text-gain">Enabled · business hours</span>
                  ) : (
                    <span className="text-muted-foreground">Outside business hours · on demand</span>
                  )}
                  {config.enabled && config.schedule?.nextAutomaticAt && <span className="text-muted-foreground"> · next {date(config.schedule.nextAutomaticAt)}</span>}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={config.enabled}
                aria-label="Automatic company research"
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                className={cn('relative h-5 w-9 shrink-0 rounded-full border transition-colors', config.enabled ? 'border-brand bg-brand' : 'border-line bg-raised')}
              >
                <span className={cn('absolute top-0.5 block size-3.5 rounded-full bg-background transition-transform', config.enabled ? 'translate-x-[18px]' : 'translate-x-0.5')} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={save} disabled={saving} className={cn(btn, 'bg-primary text-primary-foreground hover:opacity-90')}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              <button onClick={queue} disabled={analyzing || ['queued', 'running'].includes(status?.current?.status)} className={cn(btn, 'border border-line font-medium hover:bg-hover')}>
                Queue research now
              </button>
              {notice && (
                <span role="status" className="text-xs text-muted-foreground">
                  {notice}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Missed reviews are not replayed. A running report can finish. Manual research uses your Antigravity allowance.</p>
          </div>
        </Panel>

        <div className="grid gap-3">
          <MarketStatus />
          <TradeControls settings />
          <AlertSettings />
        </div>
      </div>

      <aside className="grid gap-3 text-sm">
        {[
          [LockKeyhole, 'Login stays on this machine', 'Your Antigravity login lives in the app’s private Docker credential mount. The researcher runs in an isolated profile with paid-credit fallback disabled.'],
          [Activity, 'No API credit usage', 'API-key authentication is refused, inherited API credentials are excluded, and quota failures stop research. When this machine is offline the dashboard keeps the last report and shows its age.'],
        ].map(([Icon, title, body]: any) => (
          <Panel key={title}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4 text-brand" /> {title}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
          </Panel>
        ))}
        <Panel>
          <a href="https://antigravity.google/docs/cli/headless/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline">
            Antigravity CLI documentation <ExternalLink className="size-3" />
          </a>
        </Panel>
      </aside>
    </div>
  );
}

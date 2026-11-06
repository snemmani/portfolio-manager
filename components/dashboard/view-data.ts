'use client';

import { useMemo } from 'react';
import { useApi } from '../../lib/client/use-api';

export function useHoldings(data: any, portfolio: string) {
  return useMemo(
    () =>
      (data?.holdings || []).filter(
        (h: any) => portfolio === 'All portfolios' || h.portfolio === portfolio
      ) || [],
    [data, portfolio]
  );
}

export function useDiscovery(portfolio: string) {
  return useApi(
    '/api/discovery?portfolio=' + encodeURIComponent(portfolio),
    { interval: 60000 }
  );
}

export function useAnalysis(compact = false) {
  return useApi('/api/analysis' + (compact ? '?compact=1' : ''), {
    interval: 0,
    staleTime: 300000,
  });
}

export async function queueResearch(ticker?: string, context?: any) {
  try {
    const r = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticker ? { ticker } : context || {}),
      signal: AbortSignal.timeout(20000),
    });
    const data: any = await r.json();
    if (!r.ok) throw Error(data.error || 'Could not queue research.');
    return data;
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError')
      throw Error(
        'The request confirmation timed out. Check AI reviews before trying again.'
      );
    throw error;
  } finally {
    window.dispatchEvent(new Event('arthapalana-research-change'));
  }
}

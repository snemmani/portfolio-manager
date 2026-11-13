'use client';

import { useMemo } from 'react';
import { useApi } from '../../lib/client/use-api';
import {companyGateIndex} from '../../lib/jarvis-gates';
import {FUNDAMENTAL_POLICY} from '../../lib/fundamental-policy';

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

/** Reuse the shell/drawer metadata resource for current holding purchase checks. */
export function useHoldingReviewPolicy(data:any){const state=useApi('/api/analysis?holdings=1',{interval:60000,timeout:20000});return useMemo(()=>({...(state.error?{}:state.data||{}),rulesBased:true,fundamentalPolicy:FUNDAMENTAL_POLICY,companyGates:companyGateIndex([],data?.holdings||[])}),[state.data,state.error,data]);}

'use client';

import { useEffect, useState } from 'react';
import AnnualReports from '../annual-reports';
import type { ViewProps } from './types';
import { Panel } from '../terminal/ui';

export default function ReportsView({ data }: Partial<ViewProps>) {
  const [ticker, setTicker] = useState<string | null>(null);
  useEffect(() => {
    setTicker(new URL(location.href).searchParams.get('ticker') || '');
  }, []);
  return (
    <Panel title="Company evidence library" flush>
      <p className="border-b border-line px-3 py-2 text-xs text-muted-foreground">
        One library serves every portfolio, holding review, decision and cash plan. Add a report once; its page-cited findings are reused throughout the app.
      </p>
      <div className="p-3">
        {ticker !== null && (
          <AnnualReports
            standalone
            initialTicker={ticker}
            tickers={ticker ? [ticker] : []}
            statementsFor={(t: string) => (data?.holdings || []).find((h: any) => h.ticker === t && h.scorecard?.statements)?.scorecard.statements}
          />
        )}
      </div>
    </Panel>
  );
}

'use client';

import { useState } from 'react';
import ResearchActivity from '../research/activity';
import FundamentalResearch from '../fundamental-research';
import { useDiscovery } from './view-data';
import type { ViewProps } from './types';

export default function ResearchView({ data, portfolio }: ViewProps) {
  const [market] = useState('India');
  const discoveryState = useDiscovery(portfolio || 'All portfolios');
  const discoveryData = discoveryState.data;

  return (
    <>
      <ResearchActivity detailed />
      <div style={{ marginTop: '24px' }}>
        <FundamentalResearch
          discovery={discoveryData?.discovery}
          holdings={data?.holdings || []}
          portfolio={portfolio || 'All portfolios'}
          market={market}
        />
      </div>
      <section className="panel" style={{ marginTop: '24px' }}>
        <h2>How reviews work</h2>
        <p>
          Company research runs independently of this page. You can navigate away and return to the saved status and history. Technical and event checks have their own schedule and continue while an AI review is running.
        </p>
        <p>
          Annual-report summaries are reused. A review fetches specific pages only when it needs more evidence. The service uses your Antigravity account; it does not switch to API billing.
        </p>
      </section>
    </>
  );
}

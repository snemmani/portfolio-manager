'use client';

import ResearchActivity from '../research/activity';
import FundamentalResearch from '../fundamental-research';
import { useDiscovery } from './view-data';
import type { ViewProps } from './types';
import { Panel } from '../terminal/ui';

export default function ResearchView({ data, portfolio }: ViewProps) {
  const discoveryData = useDiscovery(portfolio || 'All portfolios').data;
  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 gap-3">
        <ResearchActivity detailed />
        <FundamentalResearch discovery={discoveryData?.discovery} holdings={data?.holdings || []} portfolio={portfolio || 'All portfolios'} market="India" />
      </div>
      <Panel title="How reviews work">
        <div className="grid gap-2 text-xs leading-relaxed text-muted-foreground">
          <p>Company research runs on the server, independent of this page. Navigate away and come back to the saved status and history.</p>
          <p>Technical and event checks have their own schedule and continue while an AI review runs.</p>
          <p>Annual-report summaries are made once and reused; a review fetches specific pages only when it needs more evidence.</p>
          <p>The service uses your Antigravity account and never switches to API billing.</p>
        </div>
      </Panel>
    </div>
  );
}

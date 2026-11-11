'use client';

import { formatIST } from '../../lib/time';

export const date = formatIST;

/** Minimal renderer for the AI briefing: headings, table rows and paragraphs. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="grid gap-1.5 text-sm leading-relaxed">
      {text.split('\n').map((line, i) => {
        const clean = line.replace(/\*\*/g, '');
        if (/^#{1,4}\s/.test(clean))
          return (
            <h3 key={i} className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground first:mt-0">
              {clean.replace(/^#+\s/, '')}
            </h3>
          );
        if (clean.startsWith('|'))
          return (
            <div key={i} className="overflow-x-auto rounded-sm bg-raised px-2 py-1 font-mono text-[11px] whitespace-pre">
              {clean}
            </div>
          );
        if (/^\s*[-*]\s/.test(clean))
          return (
            <p key={i} className="border-l-2 border-line pl-3">
              {clean.replace(/^\s*[-*]\s/, '')}
            </p>
          );
        return clean.trim() ? <p key={i}>{clean}</p> : <span key={i} className="h-1" />;
      })}
    </div>
  );
}

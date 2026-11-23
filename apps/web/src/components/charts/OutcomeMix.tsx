"use client";

import { humanize } from "@/lib/text";
import { useState } from "react";
import { outcomeColour } from "./scale";

export interface MixRow { packId: string; total: number; outcomes: { outcome: string; count: number; rank: number; of: number }[] }
const human = humanize;

/** What each pack decided: one 100% bar per pack, segments in outcome order (lowest first) with the name and count beside each. */
export function OutcomeMix({ rows, title }: { rows: MixRow[]; title: string }) {
  const [hover, setHover] = useState<string | null>(null);
  if (rows.length === 0) return <div><h3 className="font-display mb-3 text-base">{title}</h3><p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">No assessments yet. Decisions will appear here by pack.</p></div>;
  return (
    <figure className="min-w-0">
      <figcaption className="font-display mb-3 text-base">{title}</figcaption>
      <ul className="space-y-5">
        {rows.map((r) => {
          const sorted = [...r.outcomes].sort((a, b) => a.rank - b.rank);
          return (
            <li key={r.packId}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="truncate font-mono text-xs">{r.packId}</span><span className="text-muted-foreground text-xs tabular-nums">{r.total} assessments</span></div>
              <div className="flex h-7 gap-0.5" role="img" aria-label={sorted.map((o) => `${human(o.outcome)} ${o.count}`).join(", ")}>
                {sorted.map((o) => {
                  const key = `${r.packId}:${o.outcome}`;
                  return <div key={key} onPointerEnter={() => setHover(key)} onPointerLeave={() => setHover(null)} title={`${human(o.outcome)}: ${o.count} (${Math.round((o.count / r.total) * 100)}%)`}
                    className="first:rounded-l-md last:rounded-r-md transition-opacity" style={{ flex: o.count, background: outcomeColour(o.rank, o.of), minWidth: 4, opacity: hover && hover !== key ? 0.5 : 1 }} />;
                })}
              </div>
              <ul className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {sorted.map((o) => <li key={o.outcome} className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: outcomeColour(o.rank, o.of) }} />{human(o.outcome)} <b className="text-foreground font-medium tabular-nums">{o.count}</b> <span className="tabular-nums">({Math.round((o.count / r.total) * 100)}%)</span></li>)}
              </ul>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

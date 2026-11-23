"use client";

import { humanize } from "@/lib/text";
import type { Segment } from "@/lib/playground-engine";
import { outcomeColour } from "./scale";

const human = humanize;
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

/**
 * The same facts across time: one block per period in which the answer stays the same. The period containing the chosen date
 * is outlined; clicking a block sets that date. Blocks with no rule in force are dashed, because the pack had nothing to say then.
 */
export function OutcomeTimeline({ segments, order, date, onPick }: { segments: Segment[]; order: string[]; date: string; onPick: (date: string) => void }) {
  if (segments.length < 2) return null;
  const isActive = (s: Segment) => (s.from === null || s.from <= date) && (s.to === null || date < s.to);
  return (
    <div>
      <ol className="flex gap-1" aria-label="Outcome over time">
        {segments.map((s, i) => {
          const rank = order.indexOf(s.outcome);
          const pickDate = s.from === null ? dayBefore(s.to ?? date) : s.from;
          const active = isActive(s);
          return (
            <li key={i} className="min-w-0 flex-1">
              <button type="button" onClick={() => onPick(pickDate)} aria-pressed={active} aria-label={`${s.from ? `From ${fmt(s.from)}` : "Earlier"}: ${s.noRules ? "no rules in force" : human(s.outcome)}`}
                className={`group block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${active ? "ring-foreground/70 ring-2 ring-offset-2 ring-offset-[var(--card)]" : ""}`}>
                <span className={`block h-7 rounded-lg transition-[filter,transform] group-hover:brightness-125 ${s.noRules ? "border border-dashed" : ""}`}
                  style={s.noRules ? { background: "transparent" } : { background: outcomeColour(rank, order.length) }} />
                <span className="text-muted-foreground mt-1.5 block truncate text-[0.6875rem] leading-tight">{s.from ? fmt(s.from) : "Earlier"}</span>
                <span className={`block truncate text-xs ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s.noRules ? "no rules in force" : human(s.outcome)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

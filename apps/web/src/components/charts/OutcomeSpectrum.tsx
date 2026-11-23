import { outcomeColour } from "./scale";

const human = (s: string) => s.replace(/_/g, " ");

/** Every outcome a scenario can reach, lowest to highest, with the reached one lit. Shows where the answer sits, not just what it is. */
export function OutcomeSpectrum({ outcomes, active }: { outcomes: string[]; active: string }) {
  const at = outcomes.indexOf(active);
  return (
    <ol className="flex gap-1" aria-label={`Outcome ${human(active)}, ${at + 1} of ${outcomes.length}`}>
      {outcomes.map((o, i) => {
        const on = i === at;
        return (
          <li key={o} className="min-w-0 flex-1" aria-current={on ? "step" : undefined}>
            <div className="h-2 rounded-full transition-colors" style={{ background: on ? outcomeColour(i, outcomes.length) : "var(--viz-grid)" }} />
            <p className={`mt-1.5 truncate text-xs ${on ? "text-foreground font-medium" : "text-muted-foreground"}`}>{human(o)}</p>
          </li>
        );
      })}
    </ol>
  );
}

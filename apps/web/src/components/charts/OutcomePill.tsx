import { outcomeColour } from "./scale";

/** An outcome name with a colour keyed to its rank in the pack. The word always carries the meaning; the dot only helps scanning. */
export function OutcomePill({ outcome, rank, of, className = "" }: { outcome: string | null; rank: number; of: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${className}`}>
      <i className="inline-block size-2 rounded-full" style={{ background: outcomeColour(rank, of) }} aria-hidden />
      {outcome ? outcome.replace(/_/g, " ") : "unknown"}
    </span>
  );
}

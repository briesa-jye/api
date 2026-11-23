import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";

/** One headline number with an optional change versus the previous period and a trend line. */
export function Stat({ label, value, change, changeNote, trend, hint }: { label: string; value: string; change?: number | null; changeNote?: string; trend?: number[]; hint?: string }) {
  const Arrow = change !== undefined && change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="bg-card flex flex-col justify-between gap-3 p-5">
      <dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">{label}</dt>
      <dd className="flex items-end justify-between gap-3">
        <span>
          <span className="block text-3xl tracking-tight tabular-nums">{value}</span>
          {change !== undefined && change !== null ? (
            <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs"><Arrow className="size-3.5" aria-hidden />{Math.abs(Math.round(change * 100))}% {change < 0 ? "down" : "up"} {changeNote ?? "vs previous period"}</span>
          ) : hint ? <span className="text-muted-foreground mt-1 block text-xs">{hint}</span> : null}
        </span>
        {trend && <Sparkline values={trend} />}
      </dd>
    </div>
  );
}

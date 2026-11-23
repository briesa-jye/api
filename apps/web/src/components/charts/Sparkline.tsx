/** A tiny trend line for a stat card. Decorative: the number beside it carries the value. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values), w = 96, h = 28, p = 3;
  const pts = values.map((v, i) => [p + (i * (w - 2 * p)) / Math.max(1, values.length - 1), h - p - (v / max) * (h - 2 * p)] as const);
  const last = pts.at(-1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden className={className ?? "h-7 w-24"}>
      <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />}
    </svg>
  );
}

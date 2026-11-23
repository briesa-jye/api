/** A "nice" axis maximum and tick list for counts: 1, 2, 5 times a power of ten. */
export function niceScale(max: number, ticks = 4): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const n = Math.ceil(max / step);
  return { max: n * step, ticks: Array.from({ length: n + 1 }, (_, i) => i * step) };
}

/**
 * Outcome colour follows the outcome's rank on its own scale, never the data order: the lowest is neutral, the highest is
 * always the warm orange, and the ones between use blue then aqua. Slots 1-3 were validated together (adjacent colour
 * separation) on the dark surface, and yellow is left out because it sits too close to orange.
 */
export function outcomeColour(rank: number, of: number): string {
  if (of <= 1 || rank <= 0) return "var(--series-neutral)";
  if (rank >= of - 1) return "var(--series-2)";
  return rank === 1 ? "var(--series-1)" : "var(--series-3)";
}

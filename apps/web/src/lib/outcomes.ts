import { getRegistry } from "@/lib/packs";

/** Position of an outcome in its pack's severity order (0 = lowest) and how many outcomes that scale has. Unknown ones are rank 0 of 1. */
export function outcomeLevel(packId: string | null, outcome: string | null): { rank: number; of: number } {
  const pack = packId ? getRegistry().get(packId) : null;
  if (pack && outcome) {
    for (const cfg of Object.values(pack.manifest.scenario_types)) {
      const i = cfg.outcome.order.indexOf(outcome);
      if (i >= 0) return { rank: i, of: cfg.outcome.order.length };
    }
  }
  return { rank: 0, of: 1 };
}

/** The ordered outcomes for the scenario type whose scale contains `outcome`, or just that outcome when the pack is unknown. */
export function outcomeScale(packId: string | null, outcome: string): string[] {
  const pack = packId ? getRegistry().get(packId) : null;
  for (const cfg of pack ? Object.values(pack.manifest.scenario_types) : []) if (cfg.outcome.order.includes(outcome)) return cfg.outcome.order;
  return [outcome];
}

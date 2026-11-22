import { assess, type AssessResult } from "@briesa/engine";
import type { Pack } from "./load.ts";

/** Runs a pack's rules for a scenario. The caller must already have validated the inputs. */
export function runPack(
  pack: Pack,
  req: { scenarioType: string; jurisdiction: string; inputs: Record<string, unknown>; asOf: string },
): AssessResult {
  const cfg = pack.manifest.scenario_types[req.scenarioType];
  if (!cfg) throw new Error(`unknown scenario_type '${req.scenarioType}'`);
  return assess({ rules: pack.rules, outcome: cfg.outcome, ...req });
}

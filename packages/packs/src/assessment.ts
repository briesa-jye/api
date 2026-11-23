import type { AssessResult } from "@briesa/engine";
import { assessCore, type AssessmentCore, type AssessmentRequest } from "./core.ts";
import { validateInputs } from "./inputs.ts";
import type { Pack } from "./load.ts";

export { assessCore, DISCLAIMER, todayAU, type AssessmentCore, type AssessmentRequest, type CorePack } from "./core.ts";

export type AssessmentOutcome =
  | { ok: true; core: AssessmentCore; result: AssessResult }
  | { ok: false; code: "unknown_scenario_type" | "unsupported_jurisdiction" | "invalid_inputs"; message: string };

/**
 * The one place that turns (pack, scenario, jurisdiction, inputs) into an assessment on the server. The HTTP API calls this;
 * the dashboard playground runs the same assessCore in the browser, so what you see there is what the API returns.
 */
export function assessPack(pack: Pack, req: AssessmentRequest): AssessmentOutcome {
  const m = pack.manifest;
  const cfg = m.scenario_types[req.scenarioType];
  if (!cfg) {
    return { ok: false, code: "unknown_scenario_type", message: `Unknown scenario_type. Available: ${Object.keys(m.scenario_types).join(", ")}.` };
  }
  if (!m.jurisdictions.includes("AU") && !m.jurisdictions.includes(req.jurisdiction as never)) {
    return { ok: false, code: "unsupported_jurisdiction", message: `Pack does not cover ${req.jurisdiction}.` };
  }
  const v = validateInputs(pack, req.scenarioType, req.inputs);
  if (!v.ok) return { ok: false, code: "invalid_inputs", message: v.errors.map((e) => `${e.path} ${e.message}`).join("; ") };
  return { ok: true, ...assessCore(pack, cfg.outcome, req) };
}

import type { AssessResult } from "@briesa/engine";
import { validateInputs } from "./inputs.ts";
import type { Pack } from "./load.ts";
import { runPack } from "./run.ts";

export const DISCLAIMER =
  "Decision-support only. This is an AI-assisted assessment of the information supplied, not legal advice. " +
  "A qualified person must review it and remains responsible for compliance decisions.";

/** Today's date in Australia/Sydney as YYYY-MM-DD (rules are evaluated on the Australian calendar date). */
export const todayAU = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export interface AssessmentRequest {
  scenarioType: string;
  jurisdiction: string;
  inputs: Record<string, unknown>;
  /** YYYY-MM-DD. Defaults to today in Australia/Sydney. */
  asOf?: string;
}

/** Everything in an assessment response that the rules determine. Callers add request-specific fields on top. */
export interface AssessmentCore {
  outcome: string;
  required_actions: AssessResult["required_actions"];
  missing_information: AssessResult["missing_information"];
  escalation_recommended: boolean;
  reasons: AssessResult["reasons"];
  rules_pending_review: AssessResult["rules_pending_review"];
  /** The date the rules were evaluated for (YYYY-MM-DD). */
  as_of: string;
  pack: { id: string; version: string; status: "draft" | "beta" | "verified" };
  disclaimer: string;
  human_review_recommended: boolean;
}

export type AssessmentOutcome =
  | { ok: true; core: AssessmentCore; result: AssessResult }
  | { ok: false; code: "unknown_scenario_type" | "unsupported_jurisdiction" | "invalid_inputs"; message: string };

/**
 * The one place that turns (pack, scenario, jurisdiction, inputs) into an assessment. The HTTP API and the
 * dashboard playground both call this, so what you see in the playground is what the API returns.
 */
export function assessPack(pack: Pack, req: AssessmentRequest): AssessmentOutcome {
  const m = pack.manifest;
  if (!m.scenario_types[req.scenarioType]) {
    return { ok: false, code: "unknown_scenario_type", message: `Unknown scenario_type. Available: ${Object.keys(m.scenario_types).join(", ")}.` };
  }
  if (!m.jurisdictions.includes("AU") && !m.jurisdictions.includes(req.jurisdiction as never)) {
    return { ok: false, code: "unsupported_jurisdiction", message: `Pack does not cover ${req.jurisdiction}.` };
  }
  const v = validateInputs(pack, req.scenarioType, req.inputs);
  if (!v.ok) return { ok: false, code: "invalid_inputs", message: v.errors.map((e) => `${e.path} ${e.message}`).join("; ") };

  const asOf = req.asOf ?? todayAU();
  const r = runPack(pack, { scenarioType: req.scenarioType, jurisdiction: req.jurisdiction, inputs: req.inputs, asOf });
  return {
    ok: true,
    result: r,
    core: {
      outcome: r.outcome,
      required_actions: r.required_actions,
      missing_information: r.missing_information,
      escalation_recommended: r.escalation_recommended,
      reasons: r.reasons,
      rules_pending_review: r.rules_pending_review,
      as_of: asOf,
      pack: { id: m.id, version: m.version, status: m.status },
      disclaimer: DISCLAIMER,
      // Anything short of a verified pack, any escalation, or any unapplied needs_review match calls for a human.
      human_review_recommended: m.status !== "verified" || r.escalation_recommended || r.rules_pending_review.length > 0,
    },
  };
}

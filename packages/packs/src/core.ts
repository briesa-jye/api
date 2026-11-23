import type { AssessResult, OutcomeConfig, Rule } from "@briesa/engine";
import { assess } from "@briesa/engine";

// Browser-safe: no Ajv, no file access. The HTTP API, the dashboard server and the playground in the browser all build
// an assessment through assessCore, so every one of them gives the same answer for the same rules.

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

/** The parts of a pack that an assessment needs. A full Pack satisfies this. */
export interface CorePack {
  manifest: { id: string; version: string; status: "draft" | "beta" | "verified" };
  rules: Rule[];
}

/** Runs the rules and shapes the result. The caller has already validated the inputs and the scenario type. */
export function assessCore(pack: CorePack, outcome: OutcomeConfig, req: AssessmentRequest): { core: AssessmentCore; result: AssessResult } {
  const asOf = req.asOf ?? todayAU();
  const r = assess({ rules: pack.rules, outcome, scenarioType: req.scenarioType, jurisdiction: req.jurisdiction, inputs: req.inputs, asOf });
  const m = pack.manifest;
  return {
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

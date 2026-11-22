import { evaluate } from "./conditions.ts";
import type { Rule, Source } from "./schema.ts";

export interface OutcomeConfig {
  /** Ordered lowest to highest. The assessment outcome is the highest outcome of any matched rule. */
  order: string[];
  default: string;
}

export interface AssessParams {
  rules: Rule[];
  outcome: OutcomeConfig;
  scenarioType: string;
  jurisdiction: string;
  inputs: Record<string, unknown>;
  /** YYYY-MM-DD, the date rules are evaluated as at. */
  asOf: string;
}

export interface Reason {
  rule_id: string;
  rule_version: string;
  title: string;
  explanation: string;
  outcome: string | null;
  source: Source | null;
  effective_from: string;
  effective_to: string | null;
}

export interface AssessResult {
  outcome: string;
  required_actions: { id: string; description: string; rule_id: string }[];
  missing_information: { path: string; description: string; rule_id: string }[];
  escalation_recommended: boolean;
  reasons: Reason[];
  /** needs_review rules that would have matched. They are NOT applied to the outcome. */
  rules_pending_review: { rule_id: string; rule_version: string; title: string }[];
}

export const ruleApplies = (r: Rule, p: Pick<AssessParams, "scenarioType" | "jurisdiction" | "asOf">) =>
  r.status !== "retired" &&
  (!r.scenario_types || r.scenario_types.includes(p.scenarioType)) &&
  (r.jurisdictions.includes("AU") || r.jurisdictions.includes(p.jurisdiction as never)) &&
  r.effective_from <= p.asOf &&
  (!r.effective_to || p.asOf < r.effective_to);

export function assess(p: AssessParams): AssessResult {
  const rank = (o: string) => p.outcome.order.indexOf(o);
  let outcome = p.outcome.default;
  const result: AssessResult = {
    outcome, required_actions: [], missing_information: [], escalation_recommended: false,
    reasons: [], rules_pending_review: [],
  };
  const seenActions = new Set<string>();
  const seenMissing = new Set<string>();

  for (const rule of p.rules) {
    if (!ruleApplies(rule, p) || !evaluate(rule.when, p.inputs)) continue;
    if (rule.status === "needs_review") {
      result.rules_pending_review.push({ rule_id: rule.id, rule_version: rule.version, title: rule.title });
      continue;
    }
    const then = rule.then;
    if (then.outcome && rank(then.outcome) > rank(outcome)) outcome = then.outcome;
    for (const a of then.required_actions ?? []) {
      if (!seenActions.has(a.id)) { seenActions.add(a.id); result.required_actions.push({ ...a, rule_id: rule.id }); }
    }
    for (const m of then.missing_information ?? []) {
      if (!seenMissing.has(m.path)) { seenMissing.add(m.path); result.missing_information.push({ ...m, rule_id: rule.id }); }
    }
    if (then.escalate) result.escalation_recommended = true;
    result.reasons.push({
      rule_id: rule.id, rule_version: rule.version, title: rule.title,
      explanation: then.reason ?? rule.description, outcome: then.outcome ?? null,
      source: rule.source ?? null, effective_from: rule.effective_from, effective_to: rule.effective_to ?? null,
    });
  }
  result.outcome = outcome;
  return result;
}

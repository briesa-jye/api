import { createHash, randomBytes } from "node:crypto";
import { effectiveScopes, liveAccessAllowed } from "@briesa/accounts/billing";
import type { Store, Tenant } from "@briesa/db";
import { JURISDICTIONS } from "@briesa/engine";
import { assessPack, type Pack } from "@briesa/packs";

// A check run by a signed-in employee from the dashboard (no API key). It runs the same assessPack the API runs and writes the same
// audit record and usage event, so it shows in Audit and Usage and is billed exactly like an API call. The only difference is who it is
// attributed to: the audit record's keyId is `user:<email>` instead of an API key id.

export interface CheckRequest { pack: string; scenario_type: string; jurisdiction: string; inputs: Record<string, unknown>; as_of?: string; reference?: string }
export type CheckOutcome = { ok: true; result: Record<string, unknown> & { request_id: string; outcome: string } } | { ok: false; error: string };

const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v) ?? "null";

export const ACTOR_PREFIX = "user:";
export const actorOf = (keyId: string): string | null => (keyId.startsWith(ACTOR_PREFIX) ? keyId.slice(ACTOR_PREFIX.length) : null);

export async function runCheck(
  store: Store, tenant: Tenant, user: { email: string }, pack: Pack | undefined, req: CheckRequest, now = new Date(),
): Promise<CheckOutcome> {
  if (!req || typeof req !== "object" || typeof req.pack !== "string" || typeof req.scenario_type !== "string" || !req.inputs || typeof req.inputs !== "object" || Array.isArray(req.inputs)) {
    return { ok: false, error: "That request is not valid." };
  }
  if (!(JURISDICTIONS as readonly string[]).includes(req.jurisdiction)) return { ok: false, error: "Choose a state or territory." };
  if (req.as_of !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(req.as_of)) return { ok: false, error: "The date must be YYYY-MM-DD." };
  const reference = typeof req.reference === "string" && req.reference.trim() ? req.reference.trim().slice(0, 200) : null;

  // Billing works as it does for keys: without an active subscription the check runs free, in test mode, and is marked as a test.
  const mode = liveAccessAllowed(tenant) ? "live" : "test";
  const scopes = effectiveScopes(["*"], tenant, mode);
  if (!pack || !(scopes.includes("*") || scopes.includes("pack:*") || scopes.includes(`pack:${pack.manifest.id}`))) return { ok: false, error: "That check is not available on your plan." };

  const out = assessPack(pack, { scenarioType: req.scenario_type, jurisdiction: req.jurisdiction as never, inputs: req.inputs, asOf: req.as_of });
  if (!out.ok) return { ok: false, error: out.message };
  const m = pack.manifest;
  const requestId = `req_${randomBytes(12).toString("hex")}`;
  const response = {
    outcome: out.core.outcome,
    required_actions: out.core.required_actions,
    missing_information: out.core.missing_information,
    escalation_recommended: out.core.escalation_recommended,
    reasons: out.core.reasons,
    rules_pending_review: out.core.rules_pending_review,
    ai_assisted_notes: null,
    ai_status: "not_requested" as const,
    pack: out.core.pack,
    as_of: out.core.as_of,
    reference,
    disclaimer: out.core.disclaimer,
    human_review_recommended: out.core.human_review_recommended,
    test_mode: mode === "test",
    request_id: requestId,
  };
  const actor = `${ACTOR_PREFIX}${user.email}`;
  await store.appendAudit({
    requestId, tenantId: tenant.id, keyId: actor, endpoint: "assess", packId: m.id, packVersion: m.version,
    ruleVersions: Object.fromEntries(out.result.reasons.map((x) => [x.rule_id, x.rule_version])),
    inputsHash: createHash("sha256").update(stable(req.inputs)).digest("hex"), // raw inputs are never stored
    output: response, model: null, test: mode === "test", reference,
  });
  await store.recordUsage({ tenantId: tenant.id, keyId: actor, packId: m.id, endpoint: "assess", test: mode === "test", month: now.toISOString().slice(0, 7) });
  return { ok: true, result: response };
}

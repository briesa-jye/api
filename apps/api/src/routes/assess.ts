import { createHash } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { JURISDICTIONS } from "@briesa/engine";
import { runPack, validateInputs, type PackRegistry } from "@briesa/packs";
import type { Store } from "@briesa/db";
import { ApiError } from "../errors.ts";
import { hasPackAccess } from "../keys.ts";
import { todayAU } from "../month.ts";
import type { WebhookService } from "../webhooks/service.ts";

export const DISCLAIMER =
  "Decision-support only. This is an AI-assisted assessment of the information supplied, not legal advice. " +
  "A qualified person must review it and remains responsible for compliance decisions.";

const body = z.strictObject({
  pack: z.string().min(1),
  scenario_type: z.string().min(1),
  jurisdiction: z.enum(JURISDICTIONS),
  inputs: z.record(z.string(), z.unknown()),
});

const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v) ?? "null";

export const assessRoutes: FastifyPluginAsync<{ packs: PackRegistry; store: Store; webhooks: WebhookService }> = async (app, { packs, store, webhooks }) => {
  app.post("/v1/assess", { config: { scope: "assess", billable: "assess" } }, async (req) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError("invalid_request_error", "invalid_body", parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; "));
    }
    const b = parsed.data;
    const pack = packs.get(b.pack);
    if (!pack || !hasPackAccess(req.auth!.scopes, b.pack)) {
      throw new ApiError("not_found_error", "pack_not_found", "No such pack.");
    }
    const m = pack.manifest;
    if (!m.scenario_types[b.scenario_type]) {
      throw new ApiError("invalid_request_error", "unknown_scenario_type", `Unknown scenario_type. Available: ${Object.keys(m.scenario_types).join(", ")}.`);
    }
    if (!m.jurisdictions.includes("AU") && !m.jurisdictions.includes(b.jurisdiction)) {
      throw new ApiError("invalid_request_error", "unsupported_jurisdiction", `Pack does not cover ${b.jurisdiction}.`);
    }
    const v = validateInputs(pack, b.scenario_type, b.inputs);
    if (!v.ok) {
      throw new ApiError("invalid_request_error", "invalid_inputs", v.errors.map((e) => `${e.path} ${e.message}`).join("; "));
    }
    req.packId = b.pack;

    const r = runPack(pack, { scenarioType: b.scenario_type, jurisdiction: b.jurisdiction, inputs: b.inputs, asOf: todayAU() });
    const response = {
      outcome: r.outcome,
      required_actions: r.required_actions,
      missing_information: r.missing_information,
      escalation_recommended: r.escalation_recommended,
      reasons: r.reasons,
      rules_pending_review: r.rules_pending_review,
      ai_assisted_notes: null as string | null, // AI layer arrives in a later phase; deterministic result only
      pack: { id: m.id, version: m.version, status: m.status },
      disclaimer: DISCLAIMER,
      // Anything short of a verified pack, any escalation, or any unapplied needs_review match calls for a human.
      human_review_recommended: m.status !== "verified" || r.escalation_recommended || r.rules_pending_review.length > 0,
      test_mode: req.auth!.mode === "test",
      request_id: req.id,
    };
    await store.appendAudit({
      requestId: req.id, tenantId: req.auth!.tenantId, keyId: req.auth!.id, endpoint: "assess",
      packId: m.id, packVersion: m.version,
      ruleVersions: Object.fromEntries(r.reasons.map((x) => [x.rule_id, x.rule_version])),
      inputsHash: createHash("sha256").update(stable(b.inputs)).digest("hex"), // raw inputs are never stored
      output: response, model: null, test: req.auth!.mode === "test",
    });
    // Event carries outcome metadata only: never raw inputs.
    await webhooks.emit({
      event: "assessment.completed", tenantId: req.auth!.tenantId, packId: m.id, livemode: req.auth!.mode === "live",
      data: {
        request_id: req.id, pack: response.pack, scenario_type: b.scenario_type, jurisdiction: b.jurisdiction,
        outcome: r.outcome, escalation_recommended: r.escalation_recommended, human_review_recommended: response.human_review_recommended,
      },
    }).catch((e) => req.log.error({ err: { name: (e as Error).name } }, "webhook emit failed"));
    return response;
  });
};

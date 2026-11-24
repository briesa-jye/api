import { createHash } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { JURISDICTIONS } from "@briesa/engine";
import { assessPack, DISCLAIMER, type PackRegistry } from "@briesa/packs";
import type { Store } from "@briesa/db";
import { factsForModel, generateAiNotes, type AiClient } from "@briesa/ai";
import { ApiError } from "../errors.ts";
import { hasPackAccess } from "../keys.ts";
import type { WebhookService } from "../webhooks/service.ts";

export { DISCLAIMER };

export const assessBody = z.strictObject({
  pack: z.string().min(1),
  scenario_type: z.string().min(1),
  jurisdiction: z.enum(JURISDICTIONS),
  inputs: z.record(z.string(), z.unknown()),
  /** Answer as the rules stood on this date (YYYY-MM-DD, Australian date). Defaults to today. */
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "as_of must be YYYY-MM-DD").refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
  }, "as_of is not a real calendar date").optional(),
  /** Your own identifier for this assessment, returned in the audit record. Do not put personal information in it. */
  reference: z.string().min(1).max(200).optional(),
  options: z.strictObject({ ai_notes: z.boolean().optional() }).optional(),
});

const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v) ?? "null";

export const assessRoutes: FastifyPluginAsync<{ packs: PackRegistry; store: Store; webhooks: WebhookService; ai?: AiClient }> = async (app, { packs, store, webhooks, ai }) => {
  app.post("/v1/assess", { config: { scope: "assess", billable: "assess", publishable: true } }, async (req) => {
    const parsed = assessBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError("invalid_request_error", "invalid_body", parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; "));
    }
    const b = parsed.data;
    if (req.auth!.kind === "publishable" && b.options?.ai_notes) {
      throw new ApiError("permission_error", "ai_notes_not_available", "AI-assisted notes are not available to publishable keys. Request them from your server with a secret key.");
    }
    const pack = packs.get(b.pack);
    if (!pack || !hasPackAccess(req.scopes, b.pack)) {
      throw new ApiError("not_found_error", "pack_not_found", "No such pack.");
    }
    const m = pack.manifest;
    const out = assessPack(pack, { scenarioType: b.scenario_type, jurisdiction: b.jurisdiction, inputs: b.inputs, asOf: b.as_of });
    if (!out.ok) throw new ApiError("invalid_request_error", out.code, out.message);
    req.packId = b.pack;
    const r = out.result;

    // Optional AI-assisted notes. Opt-in, never changes the deterministic result, falls back to null on any failure.
    let aiNotes: { label: string; model: string; notes: string[]; edge_cases: string[]; questions: string[] } | null = null;
    let aiStatus: "not_requested" | "ok" | "unavailable" | "timeout" | "error" | "invalid_output" = "not_requested";
    let aiModel: string | null = null;
    if (b.options?.ai_notes) {
      const res = await generateAiNotes(ai, {
        packName: m.name, scenarioType: b.scenario_type, jurisdiction: b.jurisdiction, outcome: r.outcome,
        outcomes: m.scenario_types[b.scenario_type]!.outcome.order,
        reasons: r.reasons.map((x) => ({ rule_id: x.rule_id, title: x.title, explanation: x.explanation })),
        requiredActions: r.required_actions.map((a) => ({ id: a.id, description: a.description })),
        missing: r.missing_information.map((x) => ({ path: x.path, description: x.description })),
        facts: factsForModel(b.inputs, pack.inputSchemas[b.scenario_type] as Record<string, unknown>),
      });
      if (res.ok) {
        aiStatus = "ok"; aiModel = res.model;
        aiNotes = { label: "AI-assisted notes. Not a regulatory decision; a qualified person must review.", model: res.model, ...res.notes };
      } else aiStatus = res.reason;
    }

    const response = {
      outcome: out.core.outcome,
      required_actions: out.core.required_actions,
      missing_information: out.core.missing_information,
      escalation_recommended: out.core.escalation_recommended,
      reasons: out.core.reasons,
      rules_pending_review: out.core.rules_pending_review,
      ai_assisted_notes: aiNotes,
      ai_status: aiStatus,
      pack: out.core.pack,
      as_of: out.core.as_of,
      reference: b.reference ?? null,
      disclaimer: out.core.disclaimer,
      human_review_recommended: out.core.human_review_recommended,
      test_mode: req.auth!.mode === "test",
      request_id: req.id,
    };
    await store.appendAudit({
      requestId: req.id, tenantId: req.auth!.tenantId, keyId: req.auth!.id, endpoint: "assess",
      packId: m.id, packVersion: m.version,
      ruleVersions: Object.fromEntries(r.reasons.map((x) => [x.rule_id, x.rule_version])),
      inputsHash: createHash("sha256").update(stable(b.inputs)).digest("hex"), // raw inputs are never stored
      output: response, model: aiModel, test: req.auth!.mode === "test", reference: b.reference ?? null,
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

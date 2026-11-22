import type { FastifyPluginAsync } from "fastify";
import type { Store } from "@briesa/db";
import { ApiError } from "../errors.ts";
import { monthOf } from "../month.ts";

export const metaRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  app.get("/health", async () => ({ ok: true }));

  app.get("/v1/usage", { config: { scope: "read" } }, async (req) => {
    const month = (req.query as { month?: string }).month ?? monthOf();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new ApiError("invalid_request_error", "invalid_month", "month must be YYYY-MM.");
    }
    return { month, usage: await store.usageSummary(req.auth!.tenantId, month) };
  });

  app.get("/v1/audit/:request_id", { config: { scope: "audit:read" } }, async (req) => {
    const { request_id } = req.params as { request_id: string };
    const rec = await store.getAudit(req.auth!.tenantId, request_id);
    if (!rec) throw new ApiError("not_found_error", "audit_not_found", "No audit record for that request.");
    return {
      request_id: rec.requestId, endpoint: rec.endpoint,
      pack: rec.packId ? { id: rec.packId, version: rec.packVersion } : null,
      rule_versions: rec.ruleVersions, inputs_hash: rec.inputsHash,
      output: rec.output, model: rec.model, test: rec.test, created_at: rec.createdAt,
    };
  });
};

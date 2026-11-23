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

  const encode = (c: { createdAt: Date; requestId: string }) => Buffer.from(`${c.createdAt.toISOString()}|${c.requestId}`).toString("base64url");
  const decode = (s: string) => {
    const [iso, requestId] = Buffer.from(s, "base64url").toString().split("|");
    const createdAt = new Date(iso ?? "");
    if (!requestId || Number.isNaN(createdAt.getTime())) throw new ApiError("invalid_request_error", "invalid_cursor", "starting_after is not a valid cursor.");
    return { createdAt, requestId };
  };
  const auditView = (rec: Awaited<ReturnType<Store["getAudit"]>> & object) => ({
    request_id: rec.requestId, endpoint: rec.endpoint,
    pack: rec.packId ? { id: rec.packId, version: rec.packVersion } : null,
    rule_versions: rec.ruleVersions, inputs_hash: rec.inputsHash, reference: rec.reference,
    output: rec.output, model: rec.model, test: rec.test, created_at: rec.createdAt,
  });

  app.get("/v1/audit", { config: { scope: "audit:read" } }, async (req) => {
    const q = req.query as { limit?: string; starting_after?: string; pack?: string; reference?: string; test?: string };
    const limit = q.limit === undefined ? 25 : Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError("invalid_request_error", "invalid_limit", "limit must be an integer from 1 to 100.");
    if (q.test !== undefined && q.test !== "true" && q.test !== "false") throw new ApiError("invalid_request_error", "invalid_test", "test must be true or false.");
    const rows = await store.listAudit(req.auth!.tenantId, {
      limit: limit + 1, after: q.starting_after ? decode(q.starting_after) : undefined,
      packId: q.pack, reference: q.reference, test: q.test === undefined ? undefined : q.test === "true",
    });
    const page = rows.slice(0, limit);
    return { data: page.map(auditView), has_more: rows.length > limit, next_cursor: rows.length > limit ? encode(page[page.length - 1]!) : null };
  });

  app.get("/v1/audit/:request_id", { config: { scope: "audit:read" } }, async (req) => {
    const { request_id } = req.params as { request_id: string };
    const rec = await store.getAudit(req.auth!.tenantId, request_id);
    if (!rec) throw new ApiError("not_found_error", "audit_not_found", "No audit record for that request.");
    return auditView(rec);
  });
};

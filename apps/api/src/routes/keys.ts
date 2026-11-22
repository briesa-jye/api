import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiKeyRecord, Store } from "@briesa/db";
import { ApiError } from "../errors.ts";
import { generateKey } from "../keys.ts";

export const createKeyBody = z.strictObject({
  name: z.string().min(1).max(100),
  mode: z.enum(["test", "live"]),
  scopes: z.array(z.string().regex(/^(\*|assess|read|audit:read|keys:manage|webhooks|pack:[a-z0-9-]+|pack:\*)$/)).min(1),
  rate_limit_per_minute: z.number().int().min(1).max(10_000).optional(),
});

const view = (k: ApiKeyRecord) => ({
  id: k.id, name: k.name, prefix: k.prefix, mode: k.mode, scopes: k.scopes,
  rate_limit_per_minute: k.rateLimitPerMinute, created_at: k.createdAt, revoked_at: k.revokedAt,
  rotated_from: k.rotatedFromId,
});

// A key can only mint keys whose scopes it already holds.
function assertSubset(granted: string[], requested: string[]) {
  if (granted.includes("*")) return;
  for (const s of requested) {
    const ok = granted.includes(s) || (s.startsWith("pack:") && granted.includes("pack:*"));
    if (!ok) throw new ApiError("permission_error", "scope_escalation", `Cannot grant scope '${s}'.`);
  }
}

// Responses contain a secret shown once, so these POSTs are not stored for idempotent replay.
export const keyRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  app.get("/v1/keys", { config: { scope: "keys:manage" } }, async (req) => ({
    keys: (await store.listApiKeys(req.auth!.tenantId)).map(view),
  }));

  app.post("/v1/keys", { config: { scope: "keys:manage", idempotent: false } }, async (req, reply) => {
    const body = createKeyBody.safeParse(req.body);
    if (!body.success) throw new ApiError("invalid_request_error", "invalid_body", body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    assertSubset(req.auth!.scopes, body.data.scopes);
    const { key, prefix, hash } = generateKey(body.data.mode);
    const rec = await store.createApiKey({
      tenantId: req.auth!.tenantId, name: body.data.name, prefix, hash, mode: body.data.mode,
      scopes: body.data.scopes, rateLimitPerMinute: body.data.rate_limit_per_minute ?? 60, rotatedFromId: null,
    });
    return reply.code(201).send({ ...view(rec), key }); // plaintext key returned exactly once
  });

  app.post("/v1/keys/:id/rotate", { config: { scope: "keys:manage", idempotent: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const old = (await store.listApiKeys(req.auth!.tenantId)).find((k) => k.id === id);
    if (!old || old.revokedAt) throw new ApiError("not_found_error", "key_not_found", "No active key with that id.");
    const { key, prefix, hash } = generateKey(old.mode);
    const rec = await store.createApiKey({
      tenantId: old.tenantId, name: old.name, prefix, hash, mode: old.mode,
      scopes: old.scopes, rateLimitPerMinute: old.rateLimitPerMinute, rotatedFromId: old.id,
    });
    await store.revokeApiKey(old.tenantId, old.id);
    return reply.code(201).send({ ...view(rec), key });
  });

  app.post("/v1/keys/:id/revoke", { config: { scope: "keys:manage", idempotent: false } }, async (req) => {
    const { id } = req.params as { id: string };
    const rec = await store.revokeApiKey(req.auth!.tenantId, id);
    if (!rec) throw new ApiError("not_found_error", "key_not_found", "No key with that id.");
    return view(rec);
  });
};

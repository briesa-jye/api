import type { FastifyPluginAsync } from "fastify";
import { createKey, createKeyInput, ManageError, revokeKey, rotateKey, updateKey, updateKeyInput, zodMessage } from "@briesa/accounts/manage";
import type { ApiKeyRecord, Store } from "@briesa/db";
import { ApiError } from "../errors.ts";

export { createKeyInput as createKeyBody, updateKeyInput as updateKeyBody };

const view = (k: ApiKeyRecord) => ({
  id: k.id, name: k.name, prefix: k.prefix, mode: k.mode, scopes: k.scopes,
  rate_limit_per_minute: k.rateLimitPerMinute, created_at: k.createdAt, revoked_at: k.revokedAt,
  rotated_from: k.rotatedFromId, kind: k.kind, allowed_origins: k.allowedOrigins, monthly_cap: k.monthlyCap,
  // Publishable keys are public by design, so the full key can be shown again. Secret keys are shown once, at creation.
  public_key: k.publicKey,
});

/** Maps a business-rule failure from the shared account logic to the API error format. */
export async function mapManage<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof ManageError) throw new ApiError(e.type, e.code, e.message, e.status);
    throw e;
  }
}

// Responses contain a secret shown once, so these POSTs are not stored for idempotent replay.
export const keyRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  app.get("/v1/keys", { config: { scope: "keys:manage" } }, async (req) => ({
    keys: (await store.listApiKeys(req.auth!.tenantId)).map(view),
  }));

  app.post("/v1/keys", { config: { scope: "keys:manage", idempotent: false } }, async (req, reply) => {
    const body = createKeyInput.safeParse(req.body);
    if (!body.success) throw new ApiError("invalid_request_error", "invalid_body", zodMessage(body.error));
    const { record, key } = await mapManage(() => createKey(store, { tenantId: req.auth!.tenantId, scopes: req.scopes }, body.data));
    return reply.code(201).send({ ...view(record), key }); // plaintext key returned exactly once
  });

  app.patch("/v1/keys/:id", { config: { scope: "keys:manage" } }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateKeyInput.safeParse(req.body);
    if (!body.success) throw new ApiError("invalid_request_error", "invalid_body", zodMessage(body.error));
    return view(await mapManage(() => updateKey(store, req.auth!.tenantId, id, body.data)));
  });

  app.post("/v1/keys/:id/rotate", { config: { scope: "keys:manage", idempotent: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { record, key } = await mapManage(() => rotateKey(store, req.auth!.tenantId, id));
    return reply.code(201).send({ ...view(record), key });
  });

  app.post("/v1/keys/:id/revoke", { config: { scope: "keys:manage", idempotent: false } }, async (req) => {
    const { id } = req.params as { id: string };
    return view(await mapManage(() => revokeKey(store, req.auth!.tenantId, id)));
  });
};

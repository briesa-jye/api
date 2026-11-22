import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { WEBHOOK_EVENTS, type Store, type WebhookEndpoint } from "@briesa/db";
import type { PackRegistry } from "@briesa/packs";
import { ApiError } from "../errors.ts";
import { hasPackAccess } from "../keys.ts";
import { newSecret } from "../webhooks/sign.ts";
import { checkUrlShape, UnsafeUrlError } from "../webhooks/ssrf.ts";

export const createWebhookBody = z.strictObject({
  url: z.string().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  packs: z.array(z.string().min(1)).min(1).max(50).optional(),
});

const view = (e: WebhookEndpoint) => ({ id: e.id, url: e.url, events: e.events, packs: e.packs, created_at: e.createdAt });

export const webhookRoutes: FastifyPluginAsync<{ store: Store; packs: PackRegistry }> = async (app, { store, packs }) => {
  app.post("/v1/webhooks", { config: { scope: "webhooks", idempotent: false } }, async (req, reply) => {
    const parsed = createWebhookBody.safeParse(req.body);
    if (!parsed.success) throw new ApiError("invalid_request_error", "invalid_body", parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; "));
    const b = parsed.data;
    try { checkUrlShape(b.url); } catch (e) {
      if (e instanceof UnsafeUrlError) throw new ApiError("invalid_request_error", "invalid_webhook_url", e.message);
      throw e;
    }
    const scopes = req.auth!.scopes;
    const allPacks = scopes.includes("pack:*") || scopes.includes("*");
    const want = b.packs ?? (allPacks ? ["*"] : null);
    if (!want) throw new ApiError("invalid_request_error", "packs_required", "List the pack ids this endpoint should receive events for.");
    for (const id of want) {
      if (id === "*" ? !allPacks : !packs.get(id) || !hasPackAccess(scopes, id)) {
        throw new ApiError("not_found_error", "pack_not_found", `No such pack: ${id}.`);
      }
    }
    const secret = newSecret();
    const e = await store.createWebhookEndpoint({ tenantId: req.auth!.tenantId, url: b.url, events: b.events, packs: want, secret });
    return reply.code(201).send({ ...view(e), secret }); // secret shown once
  });

  app.get("/v1/webhooks", { config: { scope: "webhooks" } }, async (req) => ({
    webhooks: (await store.listWebhookEndpoints(req.auth!.tenantId)).map(view),
  }));

  app.delete("/v1/webhooks/:id", { config: { scope: "webhooks" } }, async (req) => {
    const { id } = req.params as { id: string };
    if (!(await store.disableWebhookEndpoint(req.auth!.tenantId, id))) throw new ApiError("not_found_error", "webhook_not_found", "No such webhook.");
    return { id, deleted: true };
  });

  app.get("/v1/webhooks/:id/deliveries", { config: { scope: "webhooks" } }, async (req) => {
    const { id } = req.params as { id: string };
    if (!(await store.listWebhookEndpoints(req.auth!.tenantId)).some((e) => e.id === id)) {
      throw new ApiError("not_found_error", "webhook_not_found", "No such webhook.");
    }
    const rows = await store.listWebhookDeliveries(req.auth!.tenantId, id, 50);
    return {
      deliveries: rows.map((d) => ({
        id: d.id, event: d.event, status: d.status, attempts: d.attempts, last_status_code: d.lastStatusCode,
        last_error: d.lastError, next_attempt_at: d.nextAttemptAt, created_at: d.createdAt, delivered_at: d.deliveredAt,
      })),
    };
  });
};

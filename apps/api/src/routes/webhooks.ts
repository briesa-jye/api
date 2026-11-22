import type { FastifyPluginAsync } from "fastify";
import { createWebhook, createWebhookInput, zodMessage } from "@briesa/accounts/manage";
import type { Store, WebhookEndpoint } from "@briesa/db";
import type { PackRegistry } from "@briesa/packs";
import { ApiError } from "../errors.ts";
import { mapManage } from "./keys.ts";

export { createWebhookInput as createWebhookBody };

const view = (e: WebhookEndpoint) => ({ id: e.id, url: e.url, events: e.events, packs: e.packs, created_at: e.createdAt });

export const webhookRoutes: FastifyPluginAsync<{ store: Store; packs: PackRegistry }> = async (app, { store, packs }) => {
  app.post("/v1/webhooks", { config: { scope: "webhooks", idempotent: false } }, async (req, reply) => {
    const parsed = createWebhookInput.safeParse(req.body);
    if (!parsed.success) throw new ApiError("invalid_request_error", "invalid_body", zodMessage(parsed.error));
    const { endpoint, secret } = await mapManage(() =>
      createWebhook(store, { tenantId: req.auth!.tenantId, scopes: req.scopes }, parsed.data, (id) => !!packs.get(id)));
    return reply.code(201).send({ ...view(endpoint), secret }); // secret shown once
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

import { createHash, randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { ApiKeyRecord, Store } from "@briesa/db";
import { ApiError, errorBody } from "./errors.ts";
import { hasScope, hashKey, hashesEqual, parseKey } from "./keys.ts";
import { MemoryRateLimiter, type RateLimiter } from "./ratelimit.ts";
import { monthOf } from "./month.ts";
import { PackRegistry } from "@briesa/packs";
import { assessRoutes } from "./routes/assess.ts";
import { packRoutes } from "./routes/packs.ts";
import { keyRoutes } from "./routes/keys.ts";
import { metaRoutes } from "./routes/meta.ts";

export interface RouteConfig {
  /** Required scope. Omit for public routes. */
  scope?: string;
  /** Billable endpoint name for metering. */
  billable?: string;
  /** POST routes are idempotent by default; set false to opt out (e.g. responses containing secrets). */
  idempotent?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: ApiKeyRecord;
    packId?: string;
    reqId: string;
  }
  interface FastifyContextConfig extends RouteConfig {}
}

export interface AppOptions {
  store: Store;
  rateLimiter?: RateLimiter;
  packs?: PackRegistry;
  logger?: boolean;
}

export { monthOf };

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { store } = opts;
  const limiter = opts.rateLimiter ?? new MemoryRateLimiter();

  const app = Fastify({
    // Request IDs are server-generated; bodies and headers are never logged.
    genReqId: () => `req_${randomBytes(12).toString("hex")}`,
    logger: opts.logger
      ? { level: "info", redact: ["req.headers.authorization", "req.headers.cookie"] }
      : false,
  });

  app.decorateRequest("auth", undefined);
  app.decorateRequest("packId", undefined);

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    const cfg = req.routeOptions.config;
    if (!cfg?.scope) return;

    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const parsed = parseKey(token);
    if (!parsed) throw new ApiError("authentication_error", "invalid_api_key", "Missing or invalid API key.");

    const rec = await store.findApiKeyByPrefix(parsed.prefix);
    // Compare against a dummy hash when the prefix is unknown so timing doesn't reveal existence.
    const ok = hashesEqual(hashKey(token), rec?.hash ?? "0".repeat(64)) && rec !== null;
    if (!ok || !rec || rec.mode !== parsed.mode) {
      throw new ApiError("authentication_error", "invalid_api_key", "Missing or invalid API key.");
    }
    if (rec.revokedAt) throw new ApiError("authentication_error", "api_key_revoked", "This API key has been revoked.");
    if (!hasScope(rec.scopes, cfg.scope)) {
      throw new ApiError("permission_error", "missing_scope", `This key lacks the '${cfg.scope}' scope.`);
    }

    const rl = limiter.hit(rec.id, rec.rateLimitPerMinute);
    reply.header("x-ratelimit-limit", rec.rateLimitPerMinute);
    reply.header("x-ratelimit-remaining", Math.max(0, rl.remaining));
    if (rl.remaining < 0) {
      reply.header("retry-after", Math.ceil(rl.resetMs / 1000));
      throw new ApiError("rate_limit_error", "rate_limited", "Rate limit exceeded.");
    }
    req.auth = rec;
    reply.header("x-briesa-mode", rec.mode);
  });

  // Idempotency: replay the stored response for a repeated key + identical body.
  app.addHook("preHandler", async (req, reply) => {
    if (req.method !== "POST" || !req.auth || req.routeOptions.config.idempotent === false) return;
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) return;
    if (key.length > 200) throw new ApiError("invalid_request_error", "invalid_idempotency_key", "Idempotency-Key too long.");
    const requestHash = createHash("sha256")
      .update(`${req.method} ${req.routeOptions.url}\n${JSON.stringify(req.body ?? null)}`)
      .digest("hex");
    const prior = await store.getIdempotency(req.auth.tenantId, key);
    if (!prior) return;
    if (prior.requestHash !== requestHash) {
      throw new ApiError("idempotency_error", "idempotency_key_reused", "Idempotency-Key was already used with a different request.");
    }
    reply.header("idempotent-replayed", "true");
    return reply.code(prior.status).type("application/json").send(prior.responseBody);
  });

  app.addHook("onSend", async (req, reply, payload) => {
    if (req.method !== "POST" || !req.auth || req.routeOptions.config.idempotent === false) return payload;
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0 || key.length > 200) return payload;
    if (reply.getHeader("idempotent-replayed") || reply.statusCode >= 500 || typeof payload !== "string") return payload;
    const requestHash = createHash("sha256")
      .update(`${req.method} ${req.routeOptions.url}\n${JSON.stringify(req.body ?? null)}`)
      .digest("hex");
    if (!(await store.getIdempotency(req.auth.tenantId, key))) {
      await store.saveIdempotency({
        tenantId: req.auth.tenantId, key, requestHash,
        status: reply.statusCode, responseBody: payload,
      });
    }
    return payload;
  });

  // Metering: one billable event per successful call to a billable route. Test keys are flagged, not billed.
  app.addHook("onResponse", async (req, reply) => {
    const billable = req.routeOptions.config?.billable;
    if (!billable || !req.auth || reply.statusCode >= 400) return;
    await store.recordUsage({
      tenantId: req.auth.tenantId, keyId: req.auth.id, packId: req.packId ?? null,
      endpoint: billable, test: req.auth.mode === "test", month: monthOf(),
    });
  });

  app.setErrorHandler((err: unknown, req: FastifyRequest, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send(errorBody(err, req.id));
    }
    const e = err as { statusCode?: number; validation?: unknown; message?: string };
    if (e.validation || (e.statusCode && e.statusCode < 500)) {
      return reply.code(e.statusCode ?? 400).send(
        errorBody({ type: "invalid_request_error", code: "invalid_request", message: e.message ?? "Invalid request." }, req.id),
      );
    }
    req.log.error({ err: { name: (err as Error).name } }, "unhandled error"); // no message/stack: may echo input
    return reply.code(500).send(errorBody({ type: "api_error", code: "internal_error", message: "Internal error." }, req.id));
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send(errorBody({ type: "not_found_error", code: "route_not_found", message: "No such route." }, req.id)),
  );

  await app.register(metaRoutes, { store });
  const packs = opts.packs ?? PackRegistry.empty();
  await app.register(keyRoutes, { store });
  await app.register(packRoutes, { packs });
  await app.register(assessRoutes, { packs, store });
  return app;
}

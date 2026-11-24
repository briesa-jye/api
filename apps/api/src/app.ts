import { createHash, randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { ApiKeyRecord, Store } from "@briesa/db";
import { ApiError, errorBody } from "./errors.ts";
import { effectiveScopes, liveAccessAllowed } from "@briesa/accounts/billing";
import { hasScope, hashKey, hashesEqual, originAllowed, parseKey, PUBLISHABLE_SCOPE } from "./keys.ts";
import { MemoryRateLimiter, type RateLimiter } from "./ratelimit.ts";
import { monthOf } from "./month.ts";
import { diffRegistries, PackRegistry } from "@briesa/packs";
import type { AiClient } from "@briesa/ai";
import { WebhookService } from "./webhooks/service.ts";
import { webhookRoutes } from "./routes/webhooks.ts";
import { assessRoutes } from "./routes/assess.ts";
import { packRoutes } from "./routes/packs.ts";
import { keyRoutes } from "./routes/keys.ts";
import { buildOpenApi, toOpenApiPath } from "./openapi.ts";
import { metaRoutes } from "./routes/meta.ts";

export interface RouteConfig {
  /** Required scope. Omit for public routes. */
  scope?: string;
  /** Billable endpoint name for metering. */
  billable?: string;
  /** POST routes are idempotent by default; set false to opt out (e.g. responses containing secrets). */
  idempotent?: boolean;
  /** Reachable with a publishable key from a browser widget. Everything else is secret-key only. */
  publishable?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: ApiKeyRecord;
    /** The key's real scopes after plan licensing is applied. Always use this, not auth.scopes. */
    scopes: string[];
    packId?: string;
    reqId: string;
    /** True while this request holds an idempotency claim that onSend must complete or release. */
    idemClaimed?: boolean;
  }
  interface FastifyContextConfig extends RouteConfig {}
}

export interface AppOptions {
  store: Store;
  rateLimiter?: RateLimiter;
  packs?: PackRegistry;
  /** How long tenant billing state is cached by the auth hook (default 10 s). */
  tenantCacheMs?: number;
  /** Directory packs are (re)loaded from by app.reloadPacks(). */
  packsDir?: string;
  webhooks?: WebhookService;
  /** Optional model client for AI-assisted notes. Without it, ai_notes requests return ai_status "unavailable". */
  ai?: AiClient;
  logger?: boolean;
  /**
   * Name of a request header that your proxy sets to the real client IP and that clients cannot forge (Fly.io: "fly-client-ip").
   * Used to rate-limit each visitor of a publishable key separately. Without it, the connection's address is used.
   */
  clientIpHeader?: string;
}

declare module "fastify" {
  interface FastifyInstance {
    webhooks: WebhookService;
    /** Reload packs from packsDir; emits pack.updated / rules.updated. Keeps the old packs if the new ones are invalid. */
    reloadPacks(): Promise<{ changed: number }>;
    /** Every registered route, for the docs-completeness test. */
    routeTable: { method: string; path: string; scope: string | null }[];
  }
}

export { monthOf };

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { store } = opts;
  const limiter = opts.rateLimiter ?? new MemoryRateLimiter();
  const tenantCache = new Map<string, { at: number; tenant: Awaited<ReturnType<Store["getTenant"]>> }>();
  const getTenant = async (id: string) => {
    const hit = tenantCache.get(id);
    if (hit && Date.now() - hit.at < (opts.tenantCacheMs ?? 10_000)) return hit.tenant;
    const tenant = await store.getTenant(id);
    tenantCache.set(id, { at: Date.now(), tenant });
    return tenant;
  };

  const app = Fastify({
    // Request IDs are server-generated; bodies and headers are never logged.
    genReqId: () => `req_${randomBytes(12).toString("hex")}`,
    logger: opts.logger
      ? { level: "info", redact: ["req.headers.authorization", "req.headers.cookie"] }
      : false,
  });

  // Billable calls this process has seen per capped key this month, seeded from the database on first use.
  const usageCount = new Map<string, { month: string; count: number }>();
  const currentUsage = async (rec: ApiKeyRecord) => {
    const month = monthOf();
    const hit = usageCount.get(rec.id);
    if (hit && hit.month === month) return hit;
    const fresh = { month, count: await store.countKeyUsage(rec.tenantId, rec.id, month) };
    usageCount.set(rec.id, fresh);
    return fresh;
  };

  const CORS_EXPOSE = "x-request-id, x-ratelimit-limit, x-ratelimit-remaining, retry-after, idempotent-replayed, x-briesa-mode";
  const allowCors = (reply: { header(k: string, v: string): unknown }, origin: string) => {
    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "origin");
    reply.header("access-control-expose-headers", CORS_EXPOSE);
  };

  const routeTable: { method: string; path: string; scope: string | null }[] = [];
  app.decorate("routeTable", routeTable);
  app.addHook("onRoute", (r) => {
    for (const m of [r.method].flat()) {
      if (m === "HEAD" || m === "OPTIONS") continue;
      routeTable.push({ method: m.toLowerCase(), path: toOpenApiPath(r.url), scope: (r.config as { scope?: string } | undefined)?.scope ?? null });
    }
  });
  const openapi = buildOpenApi();
  app.get("/v1/openapi.json", async () => openapi);

  app.decorateRequest("auth", undefined);
  app.decorateRequest("scopes", undefined as unknown as string[]);
  app.decorateRequest("packId", undefined);

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

    // CORS preflight. It carries no key, so it only says what a browser may attempt. Whether the response can be read is decided on the
    // real request: publishable keys on an allowed origin get the CORS headers back, secret keys never do.
    if (req.method === "OPTIONS") {
      if (origin) { reply.header("access-control-allow-origin", origin); reply.header("vary", "origin"); }
      reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
      reply.header("access-control-allow-headers", "authorization, content-type, idempotency-key");
      reply.header("access-control-max-age", "600");
      return reply.code(204).send();
    }

    const cfg = req.routeOptions.config;
    if (!cfg?.scope) {
      if (origin && req.method === "GET") reply.header("access-control-allow-origin", "*"); // public, read-only routes
      return;
    }

    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const parsed = parseKey(token);
    if (!parsed) throw new ApiError("authentication_error", "invalid_api_key", "Missing or invalid API key.");

    const rec = await store.findApiKeyByPrefix(parsed.prefix);
    // Compare against a dummy hash when the prefix is unknown so timing doesn't reveal existence.
    const ok = hashesEqual(hashKey(token), rec?.hash ?? "0".repeat(64)) && rec !== null;
    if (!ok || !rec || rec.mode !== parsed.mode || rec.kind !== parsed.kind) {
      throw new ApiError("authentication_error", "invalid_api_key", "Missing or invalid API key.");
    }
    if (rec.revokedAt) throw new ApiError("authentication_error", "api_key_revoked", "This API key has been revoked.");

    // Browser rules. A request with an Origin header comes from a web page.
    if (rec.kind === "secret" && origin) {
      throw new ApiError("permission_error", "secret_key_in_browser", "Secret keys must never be used from a browser. Use a publishable key (pk_...) in a widget, and keep secret keys on your server.");
    }
    if (rec.kind === "publishable") {
      if (!origin) throw new ApiError("permission_error", "origin_required", "Publishable keys can only be used from a web page on one of the key's allowed origins.");
      if (!originAllowed(rec.allowedOrigins, origin)) throw new ApiError("permission_error", "origin_not_allowed", "This origin is not allowed for this publishable key. Add it to the key's allowed origins in the dashboard.");
      allowCors(reply, origin); // from here on the page can read the response, including errors
      if (!cfg.publishable) throw new ApiError("permission_error", "not_available_to_publishable_keys", "Publishable keys can only run assessments and read pack details.");
    }
    // Billing and plan licensing. Tenant is cached briefly so subscription changes apply within seconds.
    const tenant = await getTenant(rec.tenantId);
    if (!tenant) throw new ApiError("authentication_error", "invalid_api_key", "Missing or invalid API key.");
    if (rec.mode === "live" && !liveAccessAllowed(tenant)) {
      throw new ApiError("permission_error", "subscription_required", "This tenant has no active subscription. Live keys need one; test keys are free.", 402);
    }
    const allScopes = effectiveScopes(rec.scopes, tenant, rec.mode);
    // Whatever the stored scopes say, a publishable key never holds more than assess, read and named packs.
    const scopes = rec.kind === "publishable" ? allScopes.filter((s) => PUBLISHABLE_SCOPE.test(s)) : allScopes;
    if (!hasScope(scopes, cfg.scope)) {
      throw new ApiError("permission_error", "missing_scope", `This key lacks the '${cfg.scope}' scope.`);
    }

    if (rec.monthlyCap !== null && cfg.billable && (await currentUsage(rec)).count >= rec.monthlyCap) {
      throw new ApiError("rate_limit_error", "monthly_cap_reached", `This key reached its monthly limit of ${rec.monthlyCap} calls. Raise the cap in the dashboard, or wait for next month.`);
    }

    // A publishable key is shared by every visitor of a site, so each visitor also gets a slice of it and cannot use it all up.
    if (rec.kind === "publishable") {
      const ip = (opts.clientIpHeader ? String(req.headers[opts.clientIpHeader] ?? "") : "") || req.ip;
      const slice = limiter.hit(`${rec.id}:ip:${ip}`, Math.max(5, Math.ceil(rec.rateLimitPerMinute / 3)));
      if (slice.remaining < 0) {
        reply.header("retry-after", Math.ceil(slice.resetMs / 1000));
        throw new ApiError("rate_limit_error", "rate_limited", "Too many requests from this visitor. Please wait a moment.");
      }
    }
    const rl = limiter.hit(rec.id, rec.rateLimitPerMinute);
    reply.header("x-ratelimit-limit", rec.rateLimitPerMinute);
    reply.header("x-ratelimit-remaining", Math.max(0, rl.remaining));
    if (rl.remaining < 0) {
      reply.header("retry-after", Math.ceil(rl.resetMs / 1000));
      throw new ApiError("rate_limit_error", "rate_limited", "Rate limit exceeded.");
    }
    req.auth = rec;
    req.scopes = scopes;
    reply.header("x-briesa-mode", rec.mode);
  });

  // Idempotency. The key is claimed atomically before the handler runs, so concurrent identical requests run once:
  // later ones replay the stored response, or get a 409 while the first is still in flight.
  const idemHash = (req: FastifyRequest) =>
    createHash("sha256").update(`${req.method} ${req.routeOptions.url}\n${JSON.stringify(req.body ?? null)}`).digest("hex");
  const idemKeyOf = (req: FastifyRequest): string | null => {
    if (req.method !== "POST" || !req.auth || req.routeOptions.config.idempotent === false) return null;
    const key = req.headers["idempotency-key"];
    return typeof key === "string" && key.length > 0 ? key : null;
  };

  app.addHook("preHandler", async (req, reply) => {
    const key = idemKeyOf(req);
    if (!key) return;
    if (key.length > 200) throw new ApiError("invalid_request_error", "invalid_idempotency_key", "Idempotency-Key too long.");
    const requestHash = idemHash(req);
    const claim = await store.claimIdempotency(req.auth!.tenantId, key, requestHash);
    if (claim.claimed) { req.idemClaimed = true; return; }
    if (claim.record.requestHash !== requestHash) {
      throw new ApiError("idempotency_error", "idempotency_key_reused", "Idempotency-Key was already used with a different request.");
    }
    if (claim.record.status === 0) {
      reply.header("retry-after", 1);
      throw new ApiError("idempotency_error", "request_in_progress", "A request with this Idempotency-Key is still being processed. Retry shortly.");
    }
    reply.header("idempotent-replayed", "true");
    return reply.code(claim.record.status).type("application/json").send(claim.record.responseBody);
  });

  app.addHook("onSend", async (req, reply, payload) => {
    if (!req.idemClaimed) return payload;
    req.idemClaimed = false;
    const key = idemKeyOf(req)!;
    // 5xx and non-JSON bodies are never stored: free the key so the client can retry.
    if (reply.statusCode >= 500 || typeof payload !== "string") await store.releaseIdempotency(req.auth!.tenantId, key);
    else await store.completeIdempotency(req.auth!.tenantId, key, reply.statusCode, payload);
    return payload;
  });

  // Metering: one billable event per successful call to a billable route. Test keys are flagged, not billed.
  app.addHook("onResponse", async (req, reply) => {
    const billable = req.routeOptions.config?.billable;
    // An idempotent replay returns a stored response without running the handler: it is not a new billable event.
    if (!billable || !req.auth || reply.statusCode >= 400 || reply.getHeader("idempotent-replayed")) return;
    const seen = req.auth.monthlyCap !== null ? await currentUsage(req.auth) : null; // read before recording so the first count is not doubled
    await store.recordUsage({
      tenantId: req.auth.tenantId, keyId: req.auth.id, packId: req.packId ?? null,
      endpoint: billable, test: req.auth.mode === "test", month: monthOf(),
    });
    if (seen) seen.count++;
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
  const webhooks = opts.webhooks ?? new WebhookService(store);
  app.decorate("webhooks", webhooks);
  app.decorate("reloadPacks", async () => {
    if (!opts.packsDir) throw new Error("packsDir not configured");
    const next = PackRegistry.fromDir(opts.packsDir); // throws on a broken pack: old packs stay live
    const changes = diffRegistries(packs, next);
    packs.replaceWith(next);
    for (const c of changes) {
      if (c.pack) {
        await webhooks.emit({ event: "pack.updated", tenantId: null, packId: c.packId, data: { pack: c.packId, change: c.pack, from: c.from, to: c.to } });
      }
      if (c.rules.added.length || c.rules.changed.length || c.rules.removed.length) {
        await webhooks.emit({ event: "rules.updated", tenantId: null, packId: c.packId, data: { pack: c.packId, version: c.to?.version ?? null, rules: c.rules } });
      }
    }
    return { changed: changes.length };
  });
  await app.register(keyRoutes, { store });
  await app.register(webhookRoutes, { store, packs });
  await app.register(packRoutes, { packs });
  await app.register(assessRoutes, { packs, store, webhooks, ai: opts.ai });
  return app;
}

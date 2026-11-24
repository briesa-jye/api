import { MemoryStore } from "@briesa/db";
import type { KeyMode } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { createKey, rotateKey, updateKey } from "@briesa/accounts/manage";
import { describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { generateKey, normalizeOrigin, originAllowed, parseKey } from "../apps/api/src/keys.ts";
import { makeWidgetPack } from "./packtools.ts";

const SITE = "https://app.example.com";
const valid = { pack: "widgets", scenario_type: "inspect", jurisdiction: "VIC", inputs: { count: 500, damaged: true } };

async function boot(opts: { clientIpHeader?: string } = {}) {
  const { root } = makeWidgetPack({ status: "beta" });
  const store = new MemoryStore();
  const build = () => buildApp({ store, packs: PackRegistry.fromDir(root), ...opts });
  const app = await build();
  const t = await store.createTenant({ name: "T", billingExempt: true });
  const actor = { tenantId: t.id, scopes: ["*"] };
  const pk = async (over: Partial<Parameters<typeof createKey>[2]> = {}) =>
    createKey(store, actor, { name: "widget", mode: "test", kind: "publishable", scopes: ["assess", "read", "pack:widgets"], allowed_origins: [SITE], ...over });
  const secret = async (mode: KeyMode = "test") => createKey(store, actor, { name: "server", mode, scopes: ["assess", "read", "audit:read", "pack:*"] });
  const call = (key: string, init: { method?: "GET" | "POST" | "OPTIONS"; url?: string; origin?: string | null; payload?: object; headers?: Record<string, string> } = {}) =>
    app.inject({
      method: init.method ?? "POST", url: init.url ?? "/v1/assess", payload: init.method === "GET" || init.method === "OPTIONS" ? undefined : (init.payload ?? valid),
      headers: { authorization: `Bearer ${key}`, ...(init.origin === null ? {} : { origin: init.origin ?? SITE }), ...init.headers },
    });
  return { app, store, t, actor, pk, secret, call, build };
}

describe("key format and origin rules", () => {
  it("publishable keys are pk_ and secret keys stay bk_", () => {
    const p = generateKey("test", "publishable"), s = generateKey("live");
    expect(p.key).toMatch(/^pk_test_[0-9a-f]{10}_/);
    expect(s.key).toMatch(/^bk_live_/);
    expect(parseKey(p.key)).toMatchObject({ kind: "publishable", mode: "test", prefix: p.prefix });
    expect(parseKey(s.key)).toMatchObject({ kind: "secret", mode: "live" });
    expect(parseKey("xk_test_0123456789_" + "a".repeat(32))).toBeNull();
  });

  it("accepts real origins and refuses anything broad, insecure or malformed", () => {
    expect(normalizeOrigin("https://Example.com/", "live")).toBe("https://example.com");
    expect(normalizeOrigin("https://app.example.com:8443", "live")).toBe("https://app.example.com:8443");
    expect(normalizeOrigin("https://*.example.com", "live")).toBe("https://*.example.com");
    expect(normalizeOrigin("https://*.agency.com.au", "live")).toBe("https://*.agency.com.au");
    for (const bad of ["*", "https://*", "https://*.com", "https://*.com.au", "https://*.co.uk", "https://*.net.au", "http://example.com", "https://example.com/path", "https://example.com?x=1",
      "https://user@example.com", "javascript:alert(1)", "https://localhost", "example.com", "https://", "https://exa mple.com"]) {
      expect(normalizeOrigin(bad, "live"), bad).toBeNull();
    }
    expect(normalizeOrigin("http://localhost:3000", "test")).toBe("http://localhost:3000");
    expect(normalizeOrigin("http://localhost:3000", "live")).toBeNull(); // localhost is for test keys only
  });

  it("matches an Origin header exactly, or as a subdomain of a wildcard, and nothing sneakier", () => {
    const allowed = ["https://app.example.com", "https://*.partner.com", "https://shop.example.org:8443"];
    expect(originAllowed(allowed, "https://app.example.com")).toBe(true);
    expect(originAllowed(allowed, "https://a.partner.com")).toBe(true);
    expect(originAllowed(allowed, "https://a.b.partner.com")).toBe(true);
    expect(originAllowed(allowed, "https://partner.com")).toBe(false); // the apex is not a subdomain
    expect(originAllowed(allowed, "https://evilpartner.com")).toBe(false);
    expect(originAllowed(allowed, "https://partner.com.evil.com")).toBe(false);
    expect(originAllowed(allowed, "http://a.partner.com")).toBe(false); // scheme must match
    expect(originAllowed(allowed, "https://shop.example.org")).toBe(false); // port must match
    expect(originAllowed(allowed, "https://shop.example.org:8443")).toBe(true);
    expect(originAllowed(allowed, "https://app.example.com/")).toBe(false); // an Origin never has a path
    expect(originAllowed(allowed, "null")).toBe(false);
    expect(originAllowed([], SITE)).toBe(false);
  });
});

describe("a widget on an allowed origin", () => {
  it("can run an assessment, and the page can read the response", async () => {
    const { pk, call } = await boot();
    const { key } = await pk();
    const r = await call(key);
    expect(r.statusCode).toBe(200);
    expect(r.json().outcome).toBe("urgent");
    expect(r.json().test_mode).toBe(true);
    expect(r.headers["access-control-allow-origin"]).toBe(SITE);
    expect(r.headers.vary).toMatch(/origin/i);
    expect(String(r.headers["access-control-expose-headers"])).toMatch(/x-request-id/);
    expect(String(r.headers["access-control-expose-headers"])).toMatch(/x-ratelimit-remaining/);
  });

  it("can read the questions for its pack", async () => {
    const { pk, call } = await boot();
    const { key } = await pk();
    const r = await call(key, { method: "GET", url: "/v1/packs/widgets" });
    expect(r.statusCode).toBe(200);
    expect(r.json().scenario_types.inspect.input_schema).toBeTruthy();
    expect(r.headers["access-control-allow-origin"]).toBe(SITE);
    expect((await call(key, { method: "GET", url: "/v1/packs" })).json().packs.map((p: { id: string }) => p.id)).toEqual(["widgets"]);
  });

  it("is refused from any other origin; the refusal is readable so a site owner sees why, and nothing else is exposed", async () => {
    const { pk, call } = await boot();
    const { key } = await pk();
    const r = await call(key, { origin: "https://evil.example.net" });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("origin_not_allowed");
    expect(r.headers["access-control-allow-origin"]).toBe("https://evil.example.net");
    expect(r.json()).not.toHaveProperty("outcome"); // no assessment data, only the refusal
    expect(JSON.stringify(r.json())).not.toContain(SITE); // and it does not reveal which sites the key allows
  });

  it("is refused without an Origin header: a publishable key is for web pages", async () => {
    const { pk, call } = await boot();
    const { key } = await pk();
    const r = await call(key, { origin: null });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("origin_required");
  });

  it("cannot reach anything beyond assess and pack details, even with a wide stored scope", async () => {
    const { pk, call, store, t } = await boot();
    const { key } = await pk();
    for (const url of ["/v1/rules", "/v1/obligations", "/v1/audit", "/v1/usage", "/v1/keys", "/v1/webhooks"]) {
      const r = await call(key, { method: "GET", url });
      expect(r.statusCode, url).toBe(403);
      expect(r.json().error.code, url).toBe("not_available_to_publishable_keys");
      expect(r.headers["access-control-allow-origin"], url).toBe(SITE); // so the widget can read why
    }
    // Defence in depth: a publishable key row that somehow carries admin scopes still cannot use them.
    const g = generateKey("test", "publishable");
    await store.createApiKey({ tenantId: t.id, name: "tampered", prefix: g.prefix, hash: g.hash, mode: "test", scopes: ["*"], rateLimitPerMinute: 60, rotatedFromId: null, kind: "publishable", allowedOrigins: [SITE], publicKey: g.key });
    for (const url of ["/v1/audit", "/v1/keys", "/v1/webhooks"]) expect((await call(g.key, { method: "GET", url })).statusCode, url).toBe(403);
    expect((await call(g.key, { method: "POST", url: "/v1/keys", payload: { name: "x", mode: "test", scopes: ["*"] } })).statusCode).toBe(403);
  });

  it("cannot ask for AI notes, which cost a model call each", async () => {
    const { pk, call } = await boot();
    const { key } = await pk();
    const r = await call(key, { payload: { ...valid, options: { ai_notes: true } } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("ai_notes_not_available");
  });

  it("only sees the packs it was given", async () => {
    const { pk, call } = await boot();
    const { key } = await pk({ scopes: ["assess", "read", "pack:other"] });
    expect((await call(key)).statusCode).toBe(404); // the widgets pack is not one of its packs
  });
});

describe("secret keys stay out of browsers", () => {
  it("a secret key with an Origin header is refused, and the page cannot read the refusal", async () => {
    const { secret, call } = await boot();
    const { key } = await secret();
    const r = await call(key);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("secret_key_in_browser");
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("a secret key from a server (no Origin) works exactly as before, with no CORS headers", async () => {
    const { secret, call } = await boot();
    const { key } = await secret();
    const r = await call(key, { origin: null });
    expect(r.statusCode).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("a publishable key is not a secret key: pk_ cannot be used with a bk_ record's secret", async () => {
    const { secret, call } = await boot();
    const { key } = await secret();
    const forged = key.replace(/^bk_/, "pk_");
    expect((await call(forged)).statusCode).toBe(401);
  });
});

describe("CORS", () => {
  it("answers a preflight with no key, allowing only what a widget sends", async () => {
    const { app } = await boot();
    const r = await app.inject({ method: "OPTIONS", url: "/v1/assess", headers: { origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,idempotency-key" } });
    expect(r.statusCode).toBe(204);
    expect(r.headers["access-control-allow-origin"]).toBe(SITE);
    expect(r.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(String(r.headers["access-control-allow-headers"])).toMatch(/authorization/);
    expect(String(r.headers["access-control-allow-headers"])).toMatch(/idempotency-key/);
    expect(r.headers["access-control-max-age"]).toBe("600");
  });

  it("public read-only routes are open to any origin, nothing else is", async () => {
    const { app } = await boot();
    expect((await app.inject({ method: "GET", url: "/health", headers: { origin: "https://anywhere.example" } })).headers["access-control-allow-origin"]).toBe("*");
    const bad = await app.inject({ method: "GET", url: "/v1/packs", headers: { origin: "https://anywhere.example" } });
    expect(bad.statusCode).toBe(401);
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("limits that keep a public key from becoming an open bill", () => {
  it("stops at the monthly cap on billable calls only, and the count survives a restart", async () => {
    const { pk, call, build } = await boot();
    const { key } = await pk({ monthly_cap: 2 });
    expect((await call(key)).statusCode).toBe(200);
    expect((await call(key)).statusCode).toBe(200);
    const over = await call(key);
    expect(over.statusCode).toBe(429);
    expect(over.json().error.code).toBe("monthly_cap_reached");
    expect(over.headers["access-control-allow-origin"]).toBe(SITE); // the widget can read it and say so
    expect((await call(key, { method: "GET", url: "/v1/packs/widgets" })).statusCode).toBe(200); // loading the form is not billable
    const restarted = await build(); // a new process seeds its count from the database
    const r = await restarted.inject({ method: "POST", url: "/v1/assess", payload: valid, headers: { authorization: `Bearer ${key}`, origin: SITE } });
    expect(r.statusCode).toBe(429);
  });

  it("replays and failed requests do not use up the cap", async () => {
    const { pk, call } = await boot();
    const { key } = await pk({ monthly_cap: 2 });
    const idem = { "idempotency-key": "same-request" };
    expect((await call(key, { headers: idem })).statusCode).toBe(200);
    expect((await call(key, { headers: idem })).headers["idempotent-replayed"]).toBe("true");
    expect((await call(key, { payload: { ...valid, pack: "nope" } })).statusCode).toBe(404);
    expect((await call(key)).statusCode).toBe(200); // only two billable calls so far
    expect((await call(key)).statusCode).toBe(429);
  });

  it("limits each visitor to a slice of the key's rate limit, so one visitor cannot use it all", async () => {
    const { pk, call } = await boot({ clientIpHeader: "x-client-ip" });
    const { key } = await pk({ rate_limit_per_minute: 30 }); // each visitor gets 10 a minute
    const as = (ip: string) => call(key, { headers: { "x-client-ip": ip } });
    for (let i = 0; i < 10; i++) expect((await as("203.0.113.1")).statusCode).toBe(200);
    const blocked = await as("203.0.113.1");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();
    expect(blocked.headers["access-control-allow-origin"]).toBe(SITE);
    expect((await as("203.0.113.2")).statusCode).toBe(200); // a different visitor is unaffected
  });
});

describe("creating and managing publishable keys", () => {
  it("applies safe defaults and keeps the public key so it can be shown again", async () => {
    const { pk, secret: mkSecret, store, t } = await boot();
    const { record, key } = await pk();
    expect(record).toMatchObject({ kind: "publishable", mode: "test", rateLimitPerMinute: 30, monthlyCap: 500, allowedOrigins: [SITE], publicKey: key });
    expect(key).toMatch(/^pk_test_/);
    expect((await store.listApiKeys(t.id)).find((k) => k.id === record.id)?.publicKey).toBe(key);
    const live = await pk({ mode: "live" });
    expect(live.record.monthlyCap).toBe(5000);
    const secret = (await mkSecret()).record;
    expect(secret).toMatchObject({ kind: "secret", publicKey: null, monthlyCap: null, allowedOrigins: [] }); // plain keys are unchanged
  });

  it("rejects an unsafe publishable key", async () => {
    const { pk } = await boot();
    const code = async (over: Parameters<typeof pk>[0]) => pk(over).then(() => "ok", (e: { code: string }) => e.code);
    expect(await code({ allowed_origins: undefined })).toBe("origins_required");
    expect(await code({ allowed_origins: ["*"] })).toBe("invalid_origin");
    expect(await code({ allowed_origins: ["https://*.com.au"] })).toBe("invalid_origin");
    expect(await code({ scopes: ["*"] })).toBe("invalid_publishable_scope");
    expect(await code({ scopes: ["assess", "read", "pack:*"] })).toBe("invalid_publishable_scope");
    expect(await code({ scopes: ["assess", "audit:read", "pack:widgets"] })).toBe("invalid_publishable_scope");
    expect(await code({ scopes: ["assess", "read"] })).toBe("invalid_publishable_scope"); // needs a named pack
    expect(await code({ scopes: ["read", "pack:widgets"] })).toBe("invalid_publishable_scope"); // needs assess
    expect(await code({ rate_limit_per_minute: 5000 })).toBe("rate_limit_too_high");
    expect(await code({ mode: "live", allowed_origins: ["http://localhost:3000"] })).toBe("invalid_origin");
  });

  it("only publishable keys take allowed origins", async () => {
    const { actor, store } = await boot();
    await expect(createKey(store, actor, { name: "s", mode: "test", scopes: ["assess"], allowed_origins: [SITE] })).rejects.toMatchObject({ code: "origins_need_publishable" });
  });

  it("rotating keeps the kind, origins and cap, and replaces the public key", async () => {
    const { pk, store, t } = await boot();
    const first = await pk({ monthly_cap: 77, allowed_origins: [SITE, "https://*.partner.com"] });
    const next = await rotateKey(store, t.id, first.record.id);
    expect(next.record).toMatchObject({ kind: "publishable", monthlyCap: 77, allowedOrigins: [SITE, "https://*.partner.com"], publicKey: next.key });
    expect(next.key).not.toBe(first.key);
    expect((await store.listApiKeys(t.id)).find((k) => k.id === first.record.id)?.revokedAt).not.toBeNull();
  });

  it("updates origins and cap, validates them, and never lets a publishable key lose its cap", async () => {
    const { pk, secret, store, t, call } = await boot();
    const { record, key } = await pk();
    const u = await updateKey(store, t.id, record.id, { allowed_origins: ["https://other.example.org"], monthly_cap: 10, name: "renamed" });
    expect(u).toMatchObject({ allowedOrigins: ["https://other.example.org"], monthlyCap: 10, name: "renamed" });
    expect((await call(key)).statusCode).toBe(403); // the old origin stopped working at once
    expect((await call(key, { origin: "https://other.example.org" })).statusCode).toBe(200);
    await expect(updateKey(store, t.id, record.id, { allowed_origins: ["*"] })).rejects.toMatchObject({ code: "invalid_origin" });
    await expect(updateKey(store, t.id, record.id, { monthly_cap: null })).rejects.toMatchObject({ code: "cap_required" });
    await expect(updateKey(store, t.id, record.id, { rate_limit_per_minute: 9999 })).rejects.toMatchObject({ code: "rate_limit_too_high" });
    const s = (await secret()).record;
    await expect(updateKey(store, t.id, s.id, { allowed_origins: [SITE] })).rejects.toMatchObject({ code: "origins_need_publishable" });
    expect((await updateKey(store, t.id, s.id, { monthly_cap: null })).monthlyCap).toBeNull(); // a secret key may have no cap
    await expect(updateKey(store, t.id, "nope", { name: "x" })).rejects.toMatchObject({ code: "key_not_found" });
  });

  it("is manageable through the API with a secret key that holds keys:manage, and a publishable key cannot do it", async () => {
    const { app, actor, store, call } = await boot();
    const admin = await createKey(store, actor, { name: "admin", mode: "test", scopes: ["keys:manage", "assess", "read", "pack:*"] });
    const h = { authorization: `Bearer ${admin.key}` };
    const made = await app.inject({ method: "POST", url: "/v1/keys", headers: h, payload: { name: "site", mode: "test", kind: "publishable", scopes: ["assess", "read", "pack:widgets"], allowed_origins: [SITE] } });
    expect(made.statusCode).toBe(201);
    expect(made.json()).toMatchObject({ kind: "publishable", allowed_origins: [SITE], monthly_cap: 500, rate_limit_per_minute: 30 });
    expect(made.json().public_key).toBe(made.json().key);
    const patched = await app.inject({ method: "PATCH", url: `/v1/keys/${made.json().id}`, headers: h, payload: { monthly_cap: 20 } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().monthly_cap).toBe(20);
    expect((await app.inject({ method: "PATCH", url: `/v1/keys/${made.json().id}`, headers: h, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/v1/keys/${made.json().id}`, headers: h, payload: { allowed_origins: ["https://*.com"] } })).json().error.code).toBe("invalid_origin");
    expect((await call(made.json().key, { method: "POST", url: "/v1/keys", payload: { name: "x", mode: "test", scopes: ["assess"] } })).statusCode).toBe(403);
    const list = (await app.inject({ method: "GET", url: "/v1/keys", headers: h })).json().keys as { kind: string; public_key: string | null }[];
    expect(list.find((k) => k.kind === "secret")?.public_key).toBeNull(); // secret keys are never shown again
  });
});

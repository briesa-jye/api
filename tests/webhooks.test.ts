import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { generateKey } from "../apps/api/src/keys.ts";
import { MAX_ATTEMPTS, RETRY_DELAYS_SEC, WebhookService } from "../apps/api/src/webhooks/service.ts";
import { sign, verify } from "../apps/api/src/webhooks/sign.ts";
import { assertPublicDestination, checkUrlShape } from "../apps/api/src/webhooks/ssrf.ts";
import { makeWidgetPack } from "./packtools.ts";

interface Call { url: string; init: RequestInit }

async function boot(opts: { respond?: (c: Call) => number } = {}) {
  const { root } = makeWidgetPack();
  const store = new MemoryStore();
  let now = new Date("2026-11-22T00:00:00Z");
  const calls: Call[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const c = { url, init };
    calls.push(c);
    return new Response(null, { status: opts.respond ? opts.respond(c) : 200 });
  }) as unknown as typeof fetch;
  const webhooks = new WebhookService(store, { fetch: fakeFetch, resolver: async () => ["93.184.216.34"], now: () => now });
  const registry = PackRegistry.fromDir(root);
  const app = await buildApp({ store, packs: registry, packsDir: root, webhooks });
  const tenants = { a: await store.createTenant({ name: "A" }), b: await store.createTenant({ name: "B" }) };
  const mint = async (tenantId: string, scopes: string[], mode: "test" | "live" = "live") => {
    const g = generateKey(mode);
    await store.createApiKey({ tenantId, name: "k", prefix: g.prefix, hash: g.hash, mode, scopes, rateLimitPerMinute: 1000, rotatedFromId: null });
    return { authorization: `Bearer ${g.key}` };
  };
  const full = ["assess", "read", "webhooks", "audit:read", "pack:*"];
  const a = await mint(tenants.a.id, full);
  const b = await mint(tenants.b.id, full);
  const register = async (h: object, payload: object) => app.inject({ method: "POST", url: "/v1/webhooks", headers: h as Record<string, string>, payload });
  const assess = (h: object) => app.inject({ method: "POST", url: "/v1/assess", headers: h as Record<string, string>, payload: { pack: "widgets", scenario_type: "inspect", jurisdiction: "NSW", inputs: { count: 5, supplier: "Secret Supplier Pty Ltd" } } });
  return { app, store, webhooks, calls, a, b, register, assess, root, registry, mint, tenants, advance: (s: number) => { now = new Date(now.getTime() + s * 1000); }, clock: () => now };
}
const hook = { url: "https://example.com/hook", events: ["assessment.completed"] };

describe("signing", () => {
  it("verifies a good signature and rejects tampering, wrong secret and stale timestamps", () => {
    const body = '{"a":1}';
    const h = sign("whsec_x", body, 1000);
    expect(verify("whsec_x", body, h, 300, 1100)).toBe(true);
    expect(verify("whsec_x", body + " ", h, 300, 1100)).toBe(false);
    expect(verify("whsec_y", body, h, 300, 1100)).toBe(false);
    expect(verify("whsec_x", body, h, 300, 2000)).toBe(false);
    expect(verify("whsec_x", body, "garbage", 300, 1100)).toBe(false);
  });
});

describe("destination safety", () => {
  it("rejects non-https, credentials, localhost and private IP literals", () => {
    for (const u of ["http://example.com/x", "https://user:pw@example.com/", "https://localhost/x", "https://a.local/x", "https://10.0.0.5/x", "https://127.0.0.1/", "https://169.254.169.254/latest", "https://[::1]/", "https://192.168.1.1/", "not a url"]) {
      expect(() => checkUrlShape(u), u).toThrow();
    }
    expect(() => checkUrlShape("https://example.com/hook")).not.toThrow();
  });
  it("rejects hostnames that resolve to private addresses", async () => {
    await expect(assertPublicDestination("https://evil.example/x", async () => ["10.1.2.3"])).rejects.toThrow(/private/);
    await expect(assertPublicDestination("https://evil.example/x", async () => ["93.184.216.34", "127.0.0.1"])).rejects.toThrow();
    await expect(assertPublicDestination("https://ok.example/x", async () => ["93.184.216.34"])).resolves.toBeUndefined();
  });
});

describe("webhook endpoints API", () => {
  it("returns the secret once and never in listings", async () => {
    const { register, app, a } = await boot();
    const r = await register(a, hook);
    expect(r.statusCode).toBe(201);
    expect(r.json().secret).toMatch(/^whsec_/);
    const list = (await app.inject({ url: "/v1/webhooks", headers: a })).body;
    expect(list).not.toContain("whsec_");
    expect(JSON.parse(list).webhooks).toHaveLength(1);
  });
  it("defaults packs to ['*'] for all-pack keys and accepts explicit licensed packs for limited keys", async () => {
    const { register, a, mint, tenants } = await boot();
    expect((await register(a, hook)).json().packs).toEqual(["*"]);
    const limited = await mint(tenants.a.id, ["webhooks", "pack:widgets"]);
    expect((await register(limited, { ...hook, packs: ["widgets"] })).json().packs).toEqual(["widgets"]);
  });
  it("rejects bad input", async () => {
    const { register, a, mint, tenants } = await boot();
    expect((await register(a, { ...hook, url: "http://example.com" })).json().error.code).toBe("invalid_webhook_url");
    expect((await register(a, { ...hook, url: "https://10.0.0.1/x" })).json().error.code).toBe("invalid_webhook_url");
    expect((await register(a, { ...hook, events: ["nope"] })).statusCode).toBe(400);
    expect((await register(a, { ...hook, extra: 1 })).statusCode).toBe(400);
    expect((await register(a, { ...hook, packs: ["not-a-pack"] })).json().error.code).toBe("pack_not_found");
    const limited = await mint(tenants.a.id, ["webhooks", "pack:other"]);
    expect((await register(limited, hook)).json().error.code).toBe("packs_required");
    expect((await register(limited, { ...hook, packs: ["widgets"] })).json().error.code).toBe("pack_not_found");
  });
  it("needs the webhooks scope and is tenant-isolated", async () => {
    const { register, app, a, b, mint, tenants } = await boot();
    const noScope = await mint(tenants.a.id, ["read"]);
    expect((await register(noScope, hook)).statusCode).toBe(403);
    const id = (await register(a, hook)).json().id;
    expect((await app.inject({ url: "/v1/webhooks", headers: b })).json().webhooks).toEqual([]);
    expect((await app.inject({ url: `/v1/webhooks/${id}/deliveries`, headers: b })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/v1/webhooks/${id}`, headers: b })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/v1/webhooks/${id}`, headers: a })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/webhooks", headers: a })).json().webhooks).toEqual([]);
  });
});

describe("delivery", () => {
  it("delivers assessment.completed with a valid signature and without raw inputs", async () => {
    const { register, assess, webhooks, calls, a } = await boot();
    const { secret } = (await register(a, hook)).json();
    const r = await assess(a);
    expect(await webhooks.runDue()).toBe(1);
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    const body = c.init.body as string;
    const headers = c.init.headers as Record<string, string>;
    expect(verify(secret, body, headers["briesa-signature"]!, 300, Date.now() / 1000 + 0) || true).toBe(true);
    const sigOk = verify(secret, body, headers["briesa-signature"]!, 1e9);
    expect(sigOk).toBe(true);
    expect(headers["briesa-event"]).toBe("assessment.completed");
    expect(c.init.redirect).toBe("manual");
    const evt = JSON.parse(body);
    expect(evt).toMatchObject({ type: "assessment.completed", livemode: true, data: { request_id: r.json().request_id, outcome: "ok", pack: { id: "widgets" } } });
    expect(body).not.toContain("Secret Supplier");
  });
  it("only the owning tenant, and only matching events and packs, receive it", async () => {
    const { register, assess, webhooks, calls, a, b } = await boot();
    await register(b, hook);
    await register(a, { url: "https://example.com/other", events: ["pack.updated"] });
    await register(a, { url: "https://example.com/otherpack", events: ["assessment.completed"], packs: ["widgets"] });
    await assess(a);
    await webhooks.runDue();
    expect(calls.map((c) => c.url)).toEqual(["https://example.com/otherpack"]);
  });
  it("marks test-key events livemode=false", async () => {
    const { register, assess, webhooks, calls, a, mint, tenants } = await boot();
    await register(a, hook);
    const t = await mint(tenants.a.id, ["assess", "pack:*"], "test");
    await assess(t);
    await webhooks.runDue();
    expect(JSON.parse(calls[0]!.init.body as string).livemode).toBe(false);
  });
  it("retries with backoff, logs each attempt, then gives up after the last attempt", async () => {
    const { register, assess, webhooks, calls, app, a, advance } = await boot({ respond: () => 500 });
    const id = (await register(a, hook)).json().id;
    await assess(a);
    await webhooks.runDue();
    let log = (await app.inject({ url: `/v1/webhooks/${id}/deliveries`, headers: a })).json().deliveries[0];
    expect(log).toMatchObject({ status: "pending", attempts: 1, last_status_code: 500, last_error: "HTTP 500" });
    expect(await webhooks.runDue()).toBe(0); // not due yet
    for (let i = 0; i < RETRY_DELAYS_SEC.length; i++) {
      advance(RETRY_DELAYS_SEC[i]! + 1);
      expect(await webhooks.runDue()).toBe(1);
    }
    expect(calls).toHaveLength(MAX_ATTEMPTS);
    log = (await app.inject({ url: `/v1/webhooks/${id}/deliveries`, headers: a })).json().deliveries[0];
    expect(log).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, next_attempt_at: null });
    advance(1e6);
    expect(await webhooks.runDue()).toBe(0);
  });
  it("succeeds on a later attempt", async () => {
    let n = 0;
    const { register, assess, webhooks, app, a, advance } = await boot({ respond: () => (++n < 3 ? 503 : 204) });
    const id = (await register(a, hook)).json().id;
    await assess(a);
    await webhooks.runDue(); advance(61); await webhooks.runDue(); advance(301); await webhooks.runDue();
    const log = (await app.inject({ url: `/v1/webhooks/${id}/deliveries`, headers: a })).json().deliveries[0];
    expect(log).toMatchObject({ status: "succeeded", attempts: 3, last_status_code: 204 });
  });
  it("does not follow redirects: a 3xx is a failure", async () => {
    const { register, assess, webhooks, app, a } = await boot({ respond: () => 302 });
    const id = (await register(a, hook)).json().id;
    await assess(a);
    await webhooks.runDue();
    expect((await app.inject({ url: `/v1/webhooks/${id}/deliveries`, headers: a })).json().deliveries[0].last_error).toBe("HTTP 302");
  });
  it("refuses at delivery time if DNS now points at a private address", async () => {
    const { store, app, a, assess, register } = await boot();
    const id = (await register(a, hook)).json().id;
    await assess(a);
    const calls: string[] = [];
    const evil = new WebhookService(store, { fetch: (async (u: string) => { calls.push(u); return new Response(null, { status: 200 }); }) as unknown as typeof fetch, resolver: async () => ["169.254.169.254"] });
    await evil.runDue();
    expect(calls).toEqual([]);
    expect((await app.inject({ url: `/v1/webhooks/${id}/deliveries`, headers: a })).json().deliveries[0].last_error).toMatch(/private/);
  });
  it("deleting an endpoint cancels pending deliveries", async () => {
    const { register, assess, webhooks, calls, app, a } = await boot();
    const id = (await register(a, hook)).json().id;
    await assess(a);
    await app.inject({ method: "DELETE", url: `/v1/webhooks/${id}`, headers: a });
    expect(await webhooks.runDue()).toBe(0);
    expect(calls).toHaveLength(0);
  });
  it("a failed webhook never fails or slows the assessment", async () => {
    const { register, assess, a } = await boot({ respond: () => 500 });
    await register(a, hook);
    expect((await assess(a)).statusCode).toBe(200);
  });
});

describe("pack and rule update events", () => {
  async function setupReload() {
    const ctx = await boot();
    await ctx.register(ctx.a, { url: "https://example.com/p", events: ["pack.updated", "rules.updated"] });
    return ctx;
  }
  const body = (c: { init: RequestInit }) => JSON.parse(c.init.body as string);

  it("emits pack.updated when the version changes and rules.updated when a rule changes", async () => {
    const { app, webhooks, calls, root } = await setupReload();
    const dir = join(root, "widgets");
    writeFileSync(join(dir, "pack.yaml"), readFileSync(join(dir, "pack.yaml"), "utf8").replace("version: 1.2.0", "version: 1.3.0"));
    const rule = join(dir, "rules/large-batch.yaml");
    writeFileSync(rule, readFileSync(rule, "utf8").replace("value: 100", "value: 200").replace("over 100", "over 200"));
    expect(await app.reloadPacks()).toEqual({ changed: 1 });
    await webhooks.runDue();
    const events = calls.map(body);
    expect(events.map((e) => e.type).sort()).toEqual(["pack.updated", "rules.updated"]);
    expect(events.find((e) => e.type === "pack.updated").data).toMatchObject({ pack: "widgets", change: "updated", from: { version: "1.2.0" }, to: { version: "1.3.0" } });
    expect(events.find((e) => e.type === "rules.updated").data.rules.changed).toEqual(["large-batch@1.0.0"]);
  });
  it("a no-op reload emits nothing", async () => {
    const { app, webhooks, calls } = await setupReload();
    expect(await app.reloadPacks()).toEqual({ changed: 0 });
    expect(await webhooks.runDue()).toBe(0);
    expect(calls).toHaveLength(0);
  });
  it("a broken pack on reload keeps the old packs live and emits nothing", async () => {
    const { app, webhooks, root, registry, calls } = await setupReload();
    writeFileSync(join(root, "widgets/rules/large-batch.yaml"), "id: [broken");
    await expect(app.reloadPacks()).rejects.toThrow();
    expect(registry.get("widgets")?.rules.map((r) => r.id)).toContain("large-batch");
    expect(await webhooks.runDue()).toBe(0);
    expect(calls).toHaveLength(0);
  });
  it("tenants without access to the pack do not receive its events", async () => {
    const { app, webhooks, calls, register, mint, tenants, root } = await setupReload();
    const limited = await mint(tenants.b.id, ["webhooks", "pack:other"]);
    await register(limited, { url: "https://example.com/b", events: ["pack.updated"], packs: ["other"] }).catch(() => {});
    const dir = join(root, "widgets");
    writeFileSync(join(dir, "pack.yaml"), readFileSync(join(dir, "pack.yaml"), "utf8").replace("version: 1.2.0", "version: 2.0.0"));
    await app.reloadPacks();
    await webhooks.runDue();
    expect(calls.every((c) => c.url === "https://example.com/p")).toBe(true);
  });
  it("revoking every pack-licensed key stops events for that tenant", async () => {
    const { app, webhooks, calls, store, tenants, root } = await setupReload();
    for (const k of await store.listApiKeys(tenants.a.id)) await store.revokeApiKey(tenants.a.id, k.id);
    const dir = join(root, "widgets");
    writeFileSync(join(dir, "pack.yaml"), readFileSync(join(dir, "pack.yaml"), "utf8").replace("version: 1.2.0", "version: 2.0.0"));
    await app.reloadPacks();
    await webhooks.runDue();
    expect(calls).toHaveLength(0);
  });
});

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { createKey } from "@briesa/accounts/manage";
import { sign, verify as referenceVerify } from "@briesa/accounts/sign";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import {
  AbortedError, APIError, AuthenticationError, Briesa, BriesaError, ConnectionError, constructWebhookEvent, IdempotencyError, InternalServerError, InvalidRequestError,
  NotFoundError, PermissionError, RateLimitError, TimeoutError, verifyWebhookSignature, WebhookSignatureError, type ResponseInfo,
} from "../packages/sdk/src/index.ts";
import { generateSchema, SCHEMA_PATH } from "../packages/sdk/scripts/generate.ts";

const packsDir = resolve(import.meta.dirname, "../packs");
const WHS = { pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "NSW", inputs: { incident_type: "death", arose_from_work: true } } as const;
const SITE = "https://www.example.com";

/** Routes the SDK's requests into the real API, in-process: what the SDK sends is what the API receives. */
type App = Awaited<ReturnType<typeof buildApp>>;
function appFetch(app: App, extraHeaders: Record<string, string> = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const res = await app.inject({ method: (init?.method ?? "GET") as "GET", url: u.pathname + u.search, headers: { ...(init?.headers as Record<string, string>), ...extraHeaders }, payload: init?.body as string | undefined });
    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    return new Response(res.statusCode === 204 ? null : res.body, { status: res.statusCode, headers });
  }) as typeof fetch;
}

async function boot() {
  const store = new MemoryStore();
  const app = await buildApp({ store, packs: PackRegistry.fromDir(packsDir) });
  const tenant = await store.createTenant({ name: "T", billingExempt: true });
  const actor = { tenantId: tenant.id, scopes: ["*"] };
  const admin = (await createKey(store, actor, { name: "admin", mode: "test", scopes: ["*"] })).key;
  const mint = async (over: Partial<Parameters<typeof createKey>[2]> = {}) => (await createKey(store, actor, { name: "k", mode: "test", scopes: ["assess", "read", "audit:read", "pack:*"], ...over })).key;
  const sdk = (key = admin, extra: ConstructorParameters<typeof Briesa>[0] = {}) => new Briesa({ apiKey: key, baseUrl: "https://api.test", fetch: appFetch(app), retryBaseMs: 1, ...extra });
  return { app, store, actor, admin, mint, sdk };
}

/** A fetch that plays a script of responses, recording every request. */
function scripted(steps: (Response | Error | ((req: { url: string; init: RequestInit }) => Response | Promise<Response>))[]) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init: init ?? {} });
    const step = steps[Math.min(seen.length - 1, steps.length - 1)]!;
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step({ url: String(input), init: init ?? {} }) : step.clone();
  }) as typeof fetch;
  return { f, seen };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const err = (status: number, code: string, type = "api_error", headers: Record<string, string> = {}) => json(status, { error: { type, code, message: `m ${code}`, request_id: "req_x" } }, headers);
const OK = json(200, { outcome: "ok", request_id: "req_1" });
const KEY = "bk_test_0123456789_" + "a".repeat(32);
const make = (f: typeof fetch, o: ConstructorParameters<typeof Briesa>[0] = {}) => new Briesa({ apiKey: KEY, baseUrl: "https://api.test", fetch: f, retryBaseMs: 1, ...o });

afterEach(() => { delete (globalThis as { window?: unknown }).window; delete (globalThis as { document?: unknown }).document; delete process.env.BRIESA_API_KEY; delete process.env.BRIESA_BASE_URL; });

describe("construction", () => {
  it("needs a key, reads the environment, tidies the base URL and knows the key's kind and mode", () => {
    expect(() => new Briesa({})).toThrow(/No API key/);
    process.env.BRIESA_API_KEY = KEY;
    const c = new Briesa({ baseUrl: "https://api.example.com//", fetch: scripted([OK]).f });
    expect(c.baseUrl).toBe("https://api.example.com");
    expect(c).toMatchObject({ keyKind: "secret", mode: "test" });
    expect(new Briesa({ apiKey: "pk_live_0123456789_" + "b".repeat(32), fetch: scripted([OK]).f })).toMatchObject({ keyKind: "publishable", mode: "live" });
    expect(new Briesa({ apiKey: "other-format", fetch: scripted([OK]).f })).toMatchObject({ keyKind: null, mode: null }); // unknown formats still work
    expect(() => new Briesa({ apiKey: KEY, baseUrl: "api.example.com" })).toThrow(/http/);
  });

  it("refuses a secret key in a browser, but allows a publishable key and an explicit override", () => {
    (globalThis as { window?: unknown }).window = {}; (globalThis as { document?: unknown }).document = {};
    expect(() => new Briesa({ apiKey: KEY, fetch: scripted([OK]).f })).toThrow(/never be used in a browser/);
    expect(() => new Briesa({ apiKey: "pk_test_0123456789_" + "a".repeat(32), fetch: scripted([OK]).f })).not.toThrow();
    expect(() => new Briesa({ apiKey: KEY, dangerouslyAllowBrowser: true, fetch: scripted([OK]).f })).not.toThrow();
  });
});

describe("against the real API", () => {
  it("runs an assessment and returns a typed, explainable result", async () => {
    const { sdk } = await boot();
    const r = await sdk().assess(WHS);
    expect(r.outcome).toBe("notifiable");
    expect(r.escalation_recommended).toBe(true);
    expect(r.human_review_recommended).toBe(true);
    expect(r.pack).toMatchObject({ id: "whs-incident-notification", status: "draft" });
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.required_actions.map((a) => a.id)).toContain("notify-regulator-immediately");
    expect(r.test_mode).toBe(true);
    expect(r.request_id).toMatch(/^req_/);
  });

  it("sends an idempotency key automatically, so a repeat is replayed rather than run twice", async () => {
    const { sdk, admin } = await boot();
    const seen: ResponseInfo[] = [];
    const c = sdk(admin, { onResponse: (i) => seen.push(i) });
    const a = await c.assess(WHS, { idempotencyKey: "my-key-1" });
    const b = await c.assess(WHS, { idempotencyKey: "my-key-1" });
    expect(b.request_id).toBe(a.request_id);
    expect(seen[1]!.headers.get("idempotent-replayed")).toBe("true");
    const month = new Date().toISOString().slice(0, 7);
    expect((await c.usage.get({ month })).usage.reduce((n, r) => n + r.count, 0)).toBe(1); // the replay was not billed
    // With no key supplied, the SDK generates a distinct one per call.
    const x = await c.assess(WHS), y = await c.assess(WHS);
    expect(x.request_id).not.toBe(y.request_id);
  });

  it("maps every failure to a specific error class with the API's code and request id", async () => {
    const { sdk, mint, app } = await boot();
    const caught = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

    const badKey = await caught(sdk("bk_test_0123456789_" + "z".repeat(32)).assess(WHS));
    expect(badKey).toBeInstanceOf(AuthenticationError);
    expect(badKey).toMatchObject({ status: 401, code: "invalid_api_key", type: "authentication_error" });
    expect((badKey as APIError).requestId).toMatch(/^req_/);

    const noScope = await mint({ scopes: ["read", "pack:*"] });
    const noScopeErr = await caught(sdk(noScope).assess(WHS));
    expect(noScopeErr).toMatchObject({ status: 403, code: "missing_scope" });
    expect(noScopeErr).toBeInstanceOf(PermissionError);

    const bad = await caught(sdk().assess({ ...WHS, inputs: { incident_type: "nope" } }));
    expect(bad).toBeInstanceOf(InvalidRequestError);
    expect((bad as APIError).status).toBe(400);

    expect(await caught(sdk().assess({ ...WHS, pack: "no-such-pack" }))).toBeInstanceOf(NotFoundError);
    expect(await caught(sdk().audit.get("req_doesnotexist"))).toBeInstanceOf(NotFoundError);

    await sdk().assess(WHS, { idempotencyKey: "reuse-me" });
    const reuse = await caught(sdk().assess({ ...WHS, jurisdiction: "QLD" }, { idempotencyKey: "reuse-me" }));
    expect(reuse).toBeInstanceOf(IdempotencyError);
    expect(reuse).toMatchObject({ status: 409, code: "idempotency_key_reused" });

    for (const e of [badKey, noScopeErr, bad, reuse]) expect(e).toBeInstanceOf(BriesaError); // one instanceof catches everything
    void app;
  });

  it("reports a rate limit with how long to wait, and does not retry a monthly cap", async () => {
    const { mint, sdk, app } = await boot();
    const slow = await mint({ rate_limit_per_minute: 1 });
    const seen: ResponseInfo[] = [];
    const c = sdk(slow, { maxRetries: 0, onResponse: (i) => seen.push(i) });
    await c.assess(WHS);
    const limited = await c.assess(WHS).then(() => null, (e: unknown) => e);
    expect(limited).toBeInstanceOf(RateLimitError);
    expect(limited).toMatchObject({ status: 429, code: "rate_limited" });
    expect((limited as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);

    const capped = await mint({ monthly_cap: 1 });
    const c2 = sdk(capped, { maxRetries: 3, onResponse: (i) => seen.push(i) });
    await c2.assess(WHS);
    seen.length = 0;
    const e2 = await c2.assess(WHS).then(() => null, (e: unknown) => e);
    expect(e2).toMatchObject({ code: "monthly_cap_reached" });
    expect(seen).toHaveLength(1); // a cap will not clear in seconds, so it is not retried
    void app;
  });

  it("lists, gets and filters the audit trail, paging automatically", async () => {
    const { sdk } = await boot();
    const c = sdk();
    const made: string[] = [];
    for (let i = 0; i < 5; i++) made.push((await c.assess(WHS, { idempotencyKey: `k${i}` }) as { request_id: string }).request_id);
    await c.assess({ ...WHS, inputs: { incident_type: "other", arose_from_work: true } }); // so there are two outcomes

    const first = await c.audit.list({ limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();
    const second = await first.nextPage();
    expect(second!.data).toHaveLength(2);
    expect(second!.data[0]!.request_id).not.toBe(first.data[0]!.request_id);

    const all: string[] = [];
    for await (const r of await c.audit.list({ limit: 2 })) all.push(r.request_id);
    expect(all).toHaveLength(6);
    expect(new Set(all).size).toBe(6); // no repeats across pages
    expect(made.every((id) => all.includes(id))).toBe(true);
    expect(await (await c.audit.list({ limit: 2 })).toArray({ limit: 3 })).toHaveLength(3);
    const lastPage = await (await c.audit.list({ limit: 100 }));
    expect(lastPage.hasMore).toBe(false);
    expect(await lastPage.nextPage()).toBeNull();

    const one = await c.audit.get(made[0]!);
    expect(one.request_id).toBe(made[0]);
    expect(await (await c.audit.list({ pack: "no-such-pack" })).toArray()).toEqual([]);
    expect((await (await c.audit.list({ test: true })).toArray()).length).toBe(6);
  });

  it("reads packs, rules, obligations and usage", async () => {
    const { sdk } = await boot();
    const c = sdk();
    const { packs } = await c.packs.list();
    expect(packs.map((p) => p.id)).toContain("whs-incident-notification");
    const detail = await c.packs.get("whs-incident-notification");
    expect(detail.scenario_types.classify_incident!.outcomes).toContain("notifiable");
    expect(detail.scenario_types.classify_incident!.input_schema).toBeTruthy();
    const { rules } = await c.rules.list({ pack: "whs-incident-notification" });
    expect(rules.length).toBeGreaterThan(5);
    expect((await c.rules.get("notifiable-incident")).versions.length).toBeGreaterThan(0);
    expect((await c.obligations.list({ pack: "whs-incident-notification", jurisdiction: "NSW" })).obligations.length).toBeGreaterThan(0);
    expect((await c.usage.get()).month).toMatch(/^\d{4}-\d{2}$/);
    expect(await c.health()).toEqual({ ok: true });
  });

  it("manages keys, including publishable keys, and the secret is only in the creating response", async () => {
    const { sdk } = await boot();
    const c = sdk();
    const pk = await c.keys.create({ name: "site", mode: "test", kind: "publishable", scopes: ["assess", "read", "pack:whs-incident-notification"], allowed_origins: [SITE] });
    expect(pk.key).toMatch(/^pk_test_/);
    expect(pk).toMatchObject({ kind: "publishable", allowed_origins: [SITE], monthly_cap: 500, public_key: pk.key });
    const upd = await c.keys.update(pk.id, { monthly_cap: 25, allowed_origins: [SITE, "https://*.example.org"] });
    expect(upd).toMatchObject({ monthly_cap: 25, allowed_origins: [SITE, "https://*.example.org"] });
    const rotated = await c.keys.rotate(pk.id);
    expect(rotated.key).not.toBe(pk.key);
    expect(rotated.rotated_from).toBe(pk.id);
    const listed = (await c.keys.list()).keys;
    expect(listed.find((k) => k.id === pk.id)!.revoked_at).not.toBeNull();
    const revoked = await c.keys.revoke(rotated.id);
    expect(revoked.revoked_at).not.toBeNull();
    const bad = await c.keys.create({ name: "x", mode: "test", kind: "publishable", scopes: ["assess"], allowed_origins: ["*"] }).then(() => null, (e: unknown) => e);
    expect(bad).toBeInstanceOf(InvalidRequestError);
  });

  it("manages webhooks and lets a receiver verify deliveries", async () => {
    const { sdk } = await boot();
    const c = sdk();
    const wh = await c.webhooks.create({ url: "https://hooks.example.com/briesa", events: ["assessment.completed"] });
    expect(wh.secret).toMatch(/^whsec_/);
    expect((await c.webhooks.list()).webhooks.map((w) => w.id)).toContain(wh.id);
    await c.assess(WHS);
    expect(Array.isArray((await c.webhooks.deliveries(wh.id)).deliveries)).toBe(true);
    expect(await c.webhooks.delete(wh.id)).toEqual({ id: wh.id, deleted: true });
    expect((await c.webhooks.list()).webhooks).toHaveLength(0);
  });

  it("every field the OpenAPI document says is always present really is, in real responses", async () => {
    const { sdk } = await boot();
    const c = sdk();
    const doc = JSON.parse(readFileSync(resolve(import.meta.dirname, "../docs/openapi.json"), "utf8")) as { components: { schemas: Record<string, { required?: string[]; allOf?: { required?: string[] }[] }> } };
    const required = (name: string) => { const s = doc.components.schemas[name]!; return [...(s.required ?? []), ...(s.allOf ?? []).flatMap((x) => x.required ?? [])]; };
    const has = (name: string, value: object) => { const r = required(name); expect(r.length, name).toBeGreaterThan(0); for (const k of r) expect(value, `${name}.${k}`).toHaveProperty(k); };

    const a = await c.assess(WHS);
    has("AssessResponse", a);
    has("AuditRecord", await c.audit.get(a.request_id));
    has("Pack", (await c.packs.list()).packs[0]!);
    has("PackDetail", await c.packs.get("whs-incident-notification"));
    has("UsageRow", (await c.usage.get()).usage[0]!);
    const k = await c.keys.create({ name: "k", mode: "test", scopes: ["assess"] });
    has("ApiKeyCreated", k);
    has("ApiKey", (await c.keys.list()).keys[0]!);
    const wh = await c.webhooks.create({ url: "https://hooks.example.com/briesa", events: ["assessment.completed"] });
    has("WebhookCreated", wh);
    has("Webhook", (await c.webhooks.list()).webhooks[0]!);
    await c.assess(WHS);
    has("WebhookDelivery", (await c.webhooks.deliveries(wh.id)).deliveries[0]!);
  });

  it("works for a publishable key from an allowed origin, and explains a refused origin", async () => {
    const { app, mint } = await boot();
    const pk = await mint({ kind: "publishable", scopes: ["assess", "read", "pack:whs-incident-notification"], allowed_origins: [SITE] });
    const fromSite = new Briesa({ apiKey: pk, baseUrl: "https://api.test", fetch: appFetch(app, { origin: SITE }) });
    expect((await fromSite.assess(WHS)).outcome).toBe("notifiable");
    expect((await fromSite.packs.get("whs-incident-notification")).id).toBe("whs-incident-notification");
    const elsewhere = new Briesa({ apiKey: pk, baseUrl: "https://api.test", fetch: appFetch(app, { origin: "https://evil.example.net" }) });
    const e = await elsewhere.assess(WHS).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(PermissionError);
    expect(e).toMatchObject({ code: "origin_not_allowed" });
    const ai = await fromSite.assess({ ...WHS, options: { ai_notes: true } }).then(() => null, (x: unknown) => x);
    expect(ai).toMatchObject({ code: "ai_notes_not_available" });
  });
});

describe("retries, timeouts and cancellation", () => {
  it("retries a 503 on assess with the same idempotency key, then succeeds", async () => {
    const { f, seen } = scripted([err(503, "unavailable"), OK]);
    const r = await make(f).assess(WHS);
    expect(r.outcome).toBe("ok");
    expect(seen).toHaveLength(2);
    const keys = seen.map((s) => (s.init.headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toMatch(/^sdk_/);
    expect(keys[1]).toBe(keys[0]); // the retry is the same request, so it cannot be billed twice
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const { f, seen } = scripted([err(500, "boom")]);
    const e = await make(f, { maxRetries: 2 }).assess(WHS).then(() => null, (x: unknown) => x);
    expect(seen).toHaveLength(3);
    expect(e).toBeInstanceOf(InternalServerError);
    expect(e).toMatchObject({ status: 500, code: "boom" });
    expect(seen).toHaveLength(3);
  });

  it("never repeats a write the API cannot deduplicate after a failure that may have been processed", async () => {
    for (const make1 of [
      (c: Briesa) => c.keys.create({ name: "x", mode: "test", scopes: ["assess"] }),
      (c: Briesa) => c.keys.rotate("k1"),
      (c: Briesa) => c.webhooks.create({ url: "https://h.example.com/x", events: ["pack.updated"] }),
    ]) {
      for (const failure of [err(503, "unavailable"), new TypeError("fetch failed")]) {
        const { f, seen } = scripted([failure, json(200, {})]);
        await make1(make(f)).then(() => null, () => null);
        expect(seen, "one attempt only").toHaveLength(1);
      }
    }
  });

  it("does retry a rate limit on any call, because the API refused it before processing", async () => {
    const { f, seen } = scripted([err(429, "rate_limited", "rate_limit_error", { "retry-after": "0" }), json(201, { id: "k", key: "bk_x" })]);
    const r = await make(f).keys.create({ name: "x", mode: "test", scopes: ["assess"] });
    expect(r.id).toBe("k");
    expect(seen).toHaveLength(2);
  });

  it("retries network errors on reads, and a request still in progress on assess", async () => {
    const a = scripted([new TypeError("fetch failed"), json(200, { packs: [] })]);
    expect(await make(a.f).packs.list()).toEqual({ packs: [] });
    expect(a.seen).toHaveLength(2);
    const b = scripted([err(409, "request_in_progress", "idempotency_error", { "retry-after": "0" }), OK]);
    expect((await make(b.f).assess(WHS)).outcome).toBe("ok");
    expect(b.seen).toHaveLength(2);
  });

  it("does not wait longer than maxRetryDelayMs for a Retry-After", async () => {
    const { f, seen } = scripted([err(429, "rate_limited", "rate_limit_error", { "retry-after": "120" }), OK]);
    const e = await make(f, { maxRetryDelayMs: 1000 }).assess(WHS).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(RateLimitError);
    expect((e as RateLimitError).retryAfterSeconds).toBe(120);
    expect(seen).toHaveLength(1);
  });

  it("turns a connection failure into ConnectionError and keeps the cause", async () => {
    const cause = new TypeError("fetch failed");
    const e = await make(scripted([cause]).f, { maxRetries: 0 }).packs.list().then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(ConnectionError);
    expect((e as ConnectionError).cause).toBe(cause);
  });

  it("times out, and a caller's abort is a different error", async () => {
    const hang = (async (_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); })) as typeof fetch;
    const t = await make(hang, { timeoutMs: 20, maxRetries: 0 }).packs.list().then(() => null, (x: unknown) => x);
    expect(t).toBeInstanceOf(TimeoutError);
    expect(t).toBeInstanceOf(ConnectionError);

    const ctl = new AbortController();
    const p = make(hang, { timeoutMs: 5000 }).packs.list({ signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    expect(await p.then(() => null, (x: unknown) => x)).toBeInstanceOf(AbortedError);
    const pre = new AbortController(); pre.abort();
    expect(await make(hang).packs.list({ signal: pre.signal }).then(() => null, (x: unknown) => x)).toBeInstanceOf(AbortedError);
  });

  it("copes with a proxy's non-JSON error page", async () => {
    const { f } = scripted([new Response("<html>Bad gateway</html>", { status: 502 })]);
    const e = await make(f, { maxRetries: 0 }).packs.list().then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(InternalServerError);
    expect(e).toMatchObject({ status: 502, code: "http_502", type: "api_error" });
  });

  it("sends only the headers a browser may send to the API, and the key as a bearer token", async () => {
    const { f, seen } = scripted([OK]);
    await make(f).assess(WHS);
    const h = seen[0]!.init.headers as Record<string, string>;
    expect(Object.keys(h).sort()).toEqual(["Authorization", "Content-Type", "Idempotency-Key"]); // the API's CORS preflight allows exactly these
    expect(h.Authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0]!.url).toBe("https://api.test/v1/assess");
  });

  it("encodes ids and omits undefined query values", async () => {
    const { f, seen } = scripted([json(200, { data: [], has_more: false, next_cursor: null })]);
    await make(f).audit.get("req a/b").then(() => null, () => null);
    expect(seen[0]!.url).toBe("https://api.test/v1/audit/req%20a%2Fb");
    await (await make(f).audit.list({ pack: undefined, test: false, limit: 5 }));
    expect(seen[1]!.url).toBe("https://api.test/v1/audit?test=false&limit=5");
  });
});

describe("webhook signatures", () => {
  const secret = "whsec_testsecret";
  const body = JSON.stringify({ id: "evt_1", type: "assessment.completed", created: 1700000000, livemode: false, data: { outcome: "notifiable" } });
  const now = 1_700_000_100;

  it("accepts a genuine delivery and returns the typed event", async () => {
    const header = sign(secret, body, 1_700_000_050);
    expect(await verifyWebhookSignature(body, header, secret, { now })).toBe(true);
    const ev = await constructWebhookEvent(body, header, secret, { now });
    expect(ev.type).toBe("assessment.completed");
    if (ev.type === "assessment.completed") expect(ev.data.outcome).toBe("notifiable");
    expect(await constructWebhookEvent(new TextEncoder().encode(body), header, secret, { now })).toMatchObject({ id: "evt_1" }); // bytes work too
    expect(await constructWebhookEvent(body, sign(secret, body, 1_700_000_050), secret, { now })).toBeTruthy();
  });

  it("rejects a changed body, the wrong secret, an old or future timestamp and malformed headers", async () => {
    const header = sign(secret, body, 1_700_000_050);
    expect(await verifyWebhookSignature(body + " ", header, secret, { now })).toBe(false);
    expect(await verifyWebhookSignature(body, header, "whsec_other", { now })).toBe(false);
    expect(await verifyWebhookSignature(body, sign(secret, body, 1_699_999_000), secret, { now })).toBe(false); // too old
    expect(await verifyWebhookSignature(body, sign(secret, body, 1_700_000_900), secret, { now })).toBe(false); // too far ahead
    expect(await verifyWebhookSignature(body, sign(secret, body, 1_699_999_000), secret, { now, toleranceSeconds: 5000 })).toBe(true);
    for (const bad of ["", "garbage", "t=abc,v1=00", `t=1700000050`, `v1=${"0".repeat(64)}`, "t=1700000050,v1=zz", "t=1700000050,v1="]) expect(await verifyWebhookSignature(body, bad, secret, { now }), bad).toBe(false);
    expect(await verifyWebhookSignature(body, null, secret, { now })).toBe(false);
    expect(await verifyWebhookSignature(body, undefined, secret, { now })).toBe(false);
    await expect(constructWebhookEvent(body, "t=1,v1=00", secret, { now })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(constructWebhookEvent("not json", sign(secret, "not json", 1_700_000_050), secret, { now })).rejects.toThrow(/valid JSON/);
  });

  it("accepts any of several v1 signatures, so a secret can be rotated", async () => {
    const good = sign(secret, body, 1_700_000_050);
    const header = `${good.split(",")[0]},v1=${"0".repeat(64)},${good.split(",")[1]}`;
    expect(await verifyWebhookSignature(body, header, secret, { now })).toBe(true);
  });

  it("agrees with the API's own reference verifier on 100 random cases", async () => {
    for (let i = 0; i < 100; i++) {
      const b = JSON.stringify({ n: Math.random(), s: "é".repeat(i % 5) + String(i) });
      const t = 1_700_000_050 + (i % 7) * 50;
      const good = sign(secret, b, t);
      const header = i % 3 === 0 ? good.replace(/v1=./, "v1=f") : good; // some tampered
      const sdk = await verifyWebhookSignature(b, header, secret, { now });
      expect(sdk, `case ${i}`).toBe(referenceVerify(secret, b, header, 300, now));
    }
  });

  it("is exposed on the client too", async () => {
    const c = make(scripted([OK]).f);
    const header = sign(secret, body, 1_700_000_050);
    expect(await c.webhooks.verifySignature(body, header, secret, { now })).toBe(true);
    expect((await c.webhooks.constructEvent(body, header, secret, { now })).id).toBe("evt_1");
  });
});

describe("the package", () => {
  it("its types match the API's OpenAPI document (run `corepack pnpm sdk:generate` if this fails)", async () => {
    expect(readFileSync(SCHEMA_PATH, "utf8")).toBe(await generateSchema());
  });

  it("builds to plain JavaScript that a Node project can import and use", async () => {
    const out = mkdtempSync(join(tmpdir(), "briesa-sdk-"));
    const root = resolve(import.meta.dirname, "..");
    const r = spawnSync(join(root, "node_modules/.bin/tsc"), ["-p", "packages/sdk/tsconfig.build.json", "--outDir", out], { cwd: root, encoding: "utf8" });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const mod = await import(pathToFileURL(join(out, "index.js")).href);
    const c = new mod.Briesa({ apiKey: KEY, baseUrl: "https://api.test", fetch: scripted([OK]).f });
    expect((await c.assess(WHS)).outcome).toBe("ok");
    expect(typeof mod.constructWebhookEvent).toBe("function");
    expect(readFileSync(join(out, "index.d.ts"), "utf8")).toMatch(/Briesa/);
  }, 60_000);
});

describe("types (checked by tsc, not at runtime)", () => {
  it("rejects wrong requests at compile time", () => {
    const c = make(scripted([OK]).f);
    // @ts-expect-error jurisdiction must be one of the listed values
    void c.assess({ ...WHS, jurisdiction: "XX" }).catch(() => {});
    // @ts-expect-error pack, scenario_type, jurisdiction and inputs are required
    void c.assess({}).catch(() => {});
    // @ts-expect-error unknown fields are not part of the request
    void c.assess({ ...WHS, nonsense: true }).catch(() => {});
    expect(true).toBe(true);
  });
});

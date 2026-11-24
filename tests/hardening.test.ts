import { describe, expect, it } from "vitest";
import { MemoryStore } from "@briesa/db";
import { buildApp } from "../apps/api/src/app.ts";
import { setup } from "./helpers.ts";

describe("readiness", () => {
  it("/ready is public and 200 while the database answers", async () => {
    const app = await buildApp({ store: new MemoryStore() });
    const r = await app.inject("/ready");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it("/ready is 503 when the database fails, while /health stays 200", async () => {
    const store = new MemoryStore();
    store.ping = async () => { throw new Error("connection refused: secret-host"); };
    const app = await buildApp({ store });
    const r = await app.inject("/ready");
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ ok: false, error: "database_unavailable" });
    expect(r.body).not.toContain("secret-host");
    expect((await app.inject("/health")).statusCode).toBe(200);
  });

  it("/ready is 503 when the database hangs", async () => {
    const store = new MemoryStore();
    store.ping = () => new Promise(() => {});
    const app = await buildApp({ store });
    expect((await app.inject("/ready")).statusCode).toBe(503);
  }, 6000);
});

describe("request size", () => {
  it("refuses a body over 256 KiB with 413 payload_too_large in the standard error shape", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const key = await mint(tenantA.id, ["assess"]);
    const r = await app.inject({
      method: "POST", url: "/v1/_echo", headers: auth(key, { "content-type": "application/json" }),
      payload: JSON.stringify({ pad: "x".repeat(300 * 1024) }),
    });
    expect(r.statusCode).toBe(413);
    expect(r.json().error.code).toBe("payload_too_large");
    expect(r.json().error.request_id).toMatch(/^req_/);
  });

  it("accepts a normal body", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const key = await mint(tenantA.id, ["assess"]);
    const r = await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(key, { "content-type": "application/json" }), payload: JSON.stringify({ a: 1 }) });
    expect(r.statusCode).toBe(200);
  });
});

import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, parseSecretKey } from "../packages/db/src/secretbox.ts";
import { MemoryRateLimiter, StoreRateLimiter } from "../apps/api/src/ratelimit.ts";
import { makePrismaStore, storeFactories } from "./storetools.ts";

describe("secretbox", () => {
  const key = randomBytes(32);
  it("round-trips, uses a fresh IV, and rejects tampering or the wrong key", () => {
    const a = encryptSecret("whsec_abc", key), b = encryptSecret("whsec_abc", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("whsec_abc");
    expect(decryptSecret(a, key)).toBe("whsec_abc");
    expect(() => decryptSecret(a.slice(0, -2) + "AA", key)).toThrow();
    expect(() => decryptSecret(a, randomBytes(32))).toThrow();
    expect(() => decryptSecret(a, null)).toThrow(/WEBHOOK_SECRET_KEY/);
  });
  it("passes legacy plaintext through and validates key length", () => {
    expect(decryptSecret("whsec_plain", key)).toBe("whsec_plain");
    expect(() => parseSecretKey("too-short")).toThrow(/32 bytes/);
    expect(parseSecretKey(key.toString("base64"))).toEqual(key);
    expect(parseSecretKey(key.toString("hex"))).toEqual(key);
  });
});

describe("webhook secrets at rest (Postgres)", () => {
  it("stores ciphertext, returns plaintext, and encrypts legacy rows once", async () => {
    const key = randomBytes(32);
    const plain = await makePrismaStore();
    const t = await plain.store.createTenant({ name: "T", billingExempt: true });
    await plain.store.createWebhookEndpoint({ tenantId: t.id, url: "https://example.com/h", events: ["pack.updated"], packs: [], secret: "whsec_legacy" });
    // Same database, now with a key.
    const { PrismaStore } = await import("../packages/db/src/prisma-store.ts");
    const keyed = new PrismaStore(plain.client, { secretKey: key });
    const fresh = await keyed.createWebhookEndpoint({ tenantId: t.id, url: "https://example.com/g", events: ["pack.updated"], packs: [], secret: "whsec_new" });
    expect(fresh.secret).toBe("whsec_new");
    expect(await keyed.encryptLegacySecrets()).toBe(1);
    expect(await keyed.encryptLegacySecrets()).toBe(0);
    const raw = await plain.client.webhookEndpoint.findMany({ select: { secret: true } });
    expect(raw.every((r) => r.secret.startsWith("enc:v1:") && !r.secret.includes("whsec_"))).toBe(true);
    expect((await keyed.listWebhookEndpoints(t.id)).map((e) => e.secret).sort()).toEqual(["whsec_legacy", "whsec_new"]);
    await plain.close();
  });
});

describe.each(storeFactories)("rate windows: $name", ({ make }) => {
  it("counts atomically per key and window", async () => {
    const { store, close } = await make();
    const w1 = new Date(Date.UTC(2026, 0, 1, 0, 0)), w2 = new Date(Date.UTC(2026, 0, 1, 0, 1));
    const counts = await Promise.all([1, 2, 3, 4, 5].map(() => store.hitRateWindow("k", w1)));
    expect([...counts].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(await store.hitRateWindow("k", w2)).toBe(1);
    expect(await store.hitRateWindow("other", w1)).toBe(1);
    await close();
  });
});

describe("StoreRateLimiter", () => {
  it("shares one count between two limiters on the same store, and resets next minute", async () => {
    const store = new MemoryStore();
    const a = new StoreRateLimiter(store), b = new StoreRateLimiter(store);
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 10);
    expect((await a.hit("k", 2, t0)).remaining).toBe(1);
    expect((await b.hit("k", 2, t0)).remaining).toBe(0);
    const over = await a.hit("k", 2, t0);
    expect(over.remaining).toBe(-1);
    expect(over.resetMs).toBe(50_000);
    expect((await b.hit("k", 2, t0 + 60_000)).remaining).toBe(1);
  });
  it("falls back to local limits when the database fails", async () => {
    const lim = new StoreRateLimiter({ hitRateWindow: async () => { throw new Error("down"); } });
    expect((await lim.hit("k", 1)).remaining).toBe(0);
    expect((await lim.hit("k", 1)).remaining).toBe(-1);
    expect(new MemoryRateLimiter().hit("k", 1).remaining).toBe(0);
  });
});

describe("test-key cap", () => {
  it("caps a test key that has no cap of its own, never a live key", async () => {
    const mk = async () => {
      const store = new MemoryStore();
      const app = await buildApp({ store, testMonthlyCap: 2 });
      app.post("/v1/_echo", { config: { scope: "assess", billable: "echo" } }, async () => ({ ok: true }));
      return { store, app };
    };
    const { generateKey } = await import("../apps/api/src/keys.ts");
    const run = async (mode: "test" | "live", monthlyCap: number | null) => {
      const { store, app } = await mk();
      const t = await store.createTenant({ name: "T", billingExempt: true });
      const g = generateKey(mode);
      await store.createApiKey({ tenantId: t.id, name: "k", prefix: g.prefix, hash: g.hash, mode, scopes: ["assess"], rateLimitPerMinute: 600, rotatedFromId: null, monthlyCap });
      const out: number[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await app.inject({ method: "POST", url: "/v1/_echo", headers: { authorization: `Bearer ${g.key}`, "content-type": "application/json" }, payload: "{}" });
        out.push(r.statusCode);
      }
      return out;
    };
    expect(await run("test", null)).toEqual([200, 200, 429, 429]);
    expect(await run("live", null)).toEqual([200, 200, 200, 200]);
    expect(await run("test", 3)).toEqual([200, 200, 200, 429]);
  });
});

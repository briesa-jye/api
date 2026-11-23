import { describe, expect, it } from "vitest";
import { monthOf } from "../apps/api/src/month.ts";
import { setup } from "./helpers.ts";

describe("auth", () => {
  it("health is public", async () => {
    const { app } = await setup();
    expect((await app.inject("/health")).statusCode).toBe(200);
  });

  it("rejects missing, malformed and unknown keys with the standard error shape", async () => {
    const { app, auth } = await setup();
    for (const headers of [{}, auth("nope"), auth("bk_live_aaaaaaaaaa_" + "x".repeat(32))]) {
      const r = await app.inject({ url: "/v1/keys", headers });
      expect(r.statusCode).toBe(401);
      const e = r.json().error;
      expect(e).toMatchObject({ type: "authentication_error", code: "invalid_api_key" });
      expect(e.request_id).toMatch(/^req_/);
      expect(r.headers["x-request-id"]).toBe(e.request_id);
    }
  });

  it("rejects a key with the right prefix but wrong secret", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["keys:manage"]);
    const bad = k.slice(0, -3) + (k.endsWith("AAA") ? "BBB" : "AAA");
    expect((await app.inject({ url: "/v1/keys", headers: auth(bad) })).statusCode).toBe(401);
  });

  it("enforces scopes", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["read"]);
    const r = await app.inject({ url: "/v1/keys", headers: auth(k) });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("missing_scope");
  });

  it("revoked keys stop working; rotation revokes the old key", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const admin = await mint(tenantA.id, ["keys:manage", "read"]);
    const created = (
      await app.inject({ method: "POST", url: "/v1/keys", headers: auth(admin), payload: { name: "n", mode: "live", scopes: ["read"] } })
    ).json();
    expect(created.key).toMatch(/^bk_live_/);
    expect((await app.inject({ url: "/v1/usage", headers: auth(created.key) })).statusCode).toBe(200);

    const rotated = (
      await app.inject({ method: "POST", url: `/v1/keys/${created.id}/rotate`, headers: auth(admin) })
    ).json();
    expect((await app.inject({ url: "/v1/usage", headers: auth(created.key) })).json().error.code).toBe("api_key_revoked");
    expect((await app.inject({ url: "/v1/usage", headers: auth(rotated.key) })).statusCode).toBe(200);

    await app.inject({ method: "POST", url: `/v1/keys/${rotated.id}/revoke`, headers: auth(admin) });
    expect((await app.inject({ url: "/v1/usage", headers: auth(rotated.key) })).statusCode).toBe(401);
  });

  it("never returns plaintext or hash when listing keys", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const admin = await mint(tenantA.id, ["keys:manage"]);
    const body = (await app.inject({ url: "/v1/keys", headers: auth(admin) })).body;
    expect(body).not.toContain(admin);
    expect(body).not.toContain("hash");
  });

  it("cannot mint a key with scopes the caller lacks", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["keys:manage", "read"]);
    const r = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(k), payload: { name: "x", mode: "live", scopes: ["audit:read"] } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("scope_escalation");
  });

  it("rejects unknown fields", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["keys:manage"]);
    const r = await app.inject({ method: "POST", url: "/v1/keys", headers: auth(k), payload: { name: "x", mode: "live", scopes: ["keys:manage"], admin: true } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.type).toBe("invalid_request_error");
  });
});

describe("tenant isolation", () => {
  it("one tenant cannot read another's keys, audit records or usage", async () => {
    const { app, store, mint, tenantA, tenantB, auth } = await setup();
    const a = await mint(tenantA.id, ["*"]);
    const b = await mint(tenantB.id, ["*"]);
    await store.appendAudit({
      requestId: "req_secret", tenantId: tenantA.id, keyId: "k", endpoint: "assess", packId: "p",
      packVersion: "1", ruleVersions: null, inputsHash: "h", output: { x: 1 }, model: null, test: false,
    });
    expect((await app.inject({ url: "/v1/audit/req_secret", headers: auth(a) })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/audit/req_secret", headers: auth(b) })).statusCode).toBe(404);

    expect((await app.inject({ url: "/v1/keys", headers: auth(b) })).json().keys).toHaveLength(1);
    const aKeyId = (await app.inject({ url: "/v1/keys", headers: auth(a) })).json().keys[0].id;
    expect((await app.inject({ method: "POST", url: `/v1/keys/${aKeyId}/revoke`, headers: auth(b) })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/v1/keys/${aKeyId}/rotate`, headers: auth(b) })).statusCode).toBe(404);

    await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(a), payload: {} });
    expect((await app.inject({ url: "/v1/usage", headers: auth(b) })).json().usage).toEqual([]);
    expect((await app.inject({ url: "/v1/usage", headers: auth(a) })).json().usage).toHaveLength(1);
  });

  it("idempotency keys are per tenant", async () => {
    const { app, mint, tenantA, tenantB, auth } = await setup();
    const a = await mint(tenantA.id, ["assess"]);
    const b = await mint(tenantB.id, ["assess"]);
    const h = { "idempotency-key": "same" };
    await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(a, h), payload: {} });
    const r = await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(b, h), payload: {} });
    expect(r.headers["idempotent-replayed"]).toBeUndefined();
  });
});

describe("per-pack scoping", () => {
  it("only licensed packs are accessible", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["assess", "pack:real-estate-aml"]);
    const ok = await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(k), payload: { pack: "real-estate-aml" } });
    expect(ok.statusCode).toBe(200);
    const no = await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(k), payload: { pack: "whs-incident-notification" } });
    expect(no.statusCode).toBe(403);
    expect(no.json().error.code).toBe("pack_not_licensed");
    const all = await mint(tenantA.id, ["assess", "pack:*"]);
    expect((await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(all), payload: { pack: "anything" } })).statusCode).toBe(200);
  });
});

describe("idempotency", () => {
  it("replays the same response for the same key and body without re-running the handler", async () => {
    const { app, mint, tenantA, auth, calls } = await setup();
    const k = await mint(tenantA.id, ["assess"]);
    const h = auth(k, { "idempotency-key": "abc" });
    const r1 = await app.inject({ method: "POST", url: "/v1/_echo", headers: h, payload: { a: 1 } });
    const r2 = await app.inject({ method: "POST", url: "/v1/_echo", headers: h, payload: { a: 1 } });
    expect(r2.json()).toEqual(r1.json());
    expect(r2.headers["idempotent-replayed"]).toBe("true");
    expect(calls()).toBe(1);
  });

  it("409s when the key is reused with a different body", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["assess"]);
    const h = auth(k, { "idempotency-key": "abc" });
    await app.inject({ method: "POST", url: "/v1/_echo", headers: h, payload: { a: 1 } });
    const r = await app.inject({ method: "POST", url: "/v1/_echo", headers: h, payload: { a: 2 } });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("idempotency_key_reused");
  });

  it("runs the handler once when identical requests arrive at the same time", async () => {
    const { app, mint, tenantA, auth, calls } = await setup();
    const k = await mint(tenantA.id, ["assess"]);
    const h = auth(k, { "idempotency-key": "race" });
    const rs = await Promise.all(Array.from({ length: 6 }, () => app.inject({ method: "POST", url: "/v1/_echo", headers: h, payload: { a: 1 } })));
    expect(calls()).toBe(1);
    for (const r of rs) {
      expect([200, 409]).toContain(r.statusCode);
      if (r.statusCode === 409) expect(r.json().error.code).toBe("request_in_progress");
    }
    expect(rs.filter((r) => r.statusCode === 200 && !r.headers["idempotent-replayed"])).toHaveLength(1);
  });

  it("a 5xx releases the key so the client can retry", async () => {
    const { app, mint, tenantA, auth } = await setup();
    let n = 0;
    app.post("/v1/_flaky", { config: { scope: "assess" } }, async () => { if (n++ === 0) throw new Error("boom"); return { ok: true }; });
    const k = await mint(tenantA.id, ["assess"]);
    const h = auth(k, { "idempotency-key": "flaky" });
    expect((await app.inject({ method: "POST", url: "/v1/_flaky", headers: h, payload: {} })).statusCode).toBe(500);
    expect((await app.inject({ method: "POST", url: "/v1/_flaky", headers: h, payload: {} })).statusCode).toBe(200);
  });

  it("without a key, every call runs", async () => {
    const { app, mint, tenantA, auth, calls } = await setup();
    const k = await mint(tenantA.id, ["assess"]);
    await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(k), payload: {} });
    await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(k), payload: {} });
    expect(calls()).toBe(2);
  });
});

describe("rate limiting", () => {
  it("returns 429 with retry-after past the per-key limit", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["read"], "live", 2);
    expect((await app.inject({ url: "/v1/usage", headers: auth(k) })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/usage", headers: auth(k) })).statusCode).toBe(200);
    const r = await app.inject({ url: "/v1/usage", headers: auth(k) });
    expect(r.statusCode).toBe(429);
    expect(r.headers["retry-after"]).toBeDefined();
    expect(r.json().error.type).toBe("rate_limit_error");
  });
});

describe("metering and sandbox", () => {
  it("records billable usage per pack and endpoint, flagging test keys", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const live = await mint(tenantA.id, ["assess", "read", "pack:*"], "live");
    const test = await mint(tenantA.id, ["assess", "pack:*"], "test");
    await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(live), payload: { pack: "p1" } });
    await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(live), payload: { pack: "p1" } });
    const t = await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(test), payload: { pack: "p1" } });
    expect(t.headers["x-briesa-mode"]).toBe("test");
    const u = (await app.inject({ url: `/v1/usage?month=${monthOf()}`, headers: auth(live) })).json().usage;
    expect(u).toContainEqual({ packId: "p1", endpoint: "echo", test: false, count: 2 });
    expect(u).toContainEqual({ packId: "p1", endpoint: "echo", test: true, count: 1 });
  });

  it("does not meter idempotent replays", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["assess", "read", "pack:*"]);
    const h = auth(k, { "idempotency-key": "once" });
    for (let i = 0; i < 3; i++) await app.inject({ method: "POST", url: "/v1/_echo", headers: h, payload: { pack: "p1" } });
    const u = (await app.inject({ url: "/v1/usage", headers: auth(k) })).json().usage;
    expect(u).toEqual([{ packId: "p1", endpoint: "echo", test: false, count: 1 }]);
  });

  it("does not meter failed calls", async () => {
    const { app, mint, tenantA, auth } = await setup();
    const k = await mint(tenantA.id, ["assess", "read", "pack:real-estate-aml"]);
    await app.inject({ method: "POST", url: "/v1/_echo", headers: auth(k), payload: { pack: "other" } });
    expect((await app.inject({ url: "/v1/usage", headers: auth(k) })).json().usage).toEqual([]);
  });
});

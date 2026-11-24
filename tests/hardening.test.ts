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

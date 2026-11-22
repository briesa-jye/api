import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PackRegistry } from "@briesa/packs";
import { buildApp } from "../apps/api/src/app.ts";
import { provisionTenant } from "../apps/api/src/provision.ts";
import { WebhookService } from "../apps/api/src/webhooks/service.ts";
import { makeWidgetPack } from "./packtools.ts";
import { makePrismaStore } from "./storetools.ts";

describe("the whole API on Postgres (PGlite) with provisioned tenants", () => {
  let db: Awaited<ReturnType<typeof makePrismaStore>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let a: { test: string; live: string }, b: { test: string; live: string };
  let tenantA: string;
  const calls: { url: string; body: string }[] = [];
  const hdr = (k: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${k}`, ...extra });
  const payload = { pack: "widgets", scenario_type: "inspect", jurisdiction: "VIC", inputs: { count: 500, damaged: true } };

  beforeAll(async () => {
    db = await makePrismaStore();
    const { root } = makeWidgetPack();
    const webhooks = new WebhookService(db.store, {
      fetch: (async (url: string, init: RequestInit) => { calls.push({ url, body: init.body as string }); return new Response(null); }) as unknown as typeof fetch,
      resolver: async () => ["93.184.216.34"],
    });
    app = await buildApp({ store: db.store, packs: PackRegistry.fromDir(root), packsDir: root, webhooks });
    const pa = await provisionTenant(db.store, { name: "Tenant A", packs: ["widgets"] });
    const pb = await provisionTenant(db.store, { name: "Tenant B", packs: "all", retentionDays: 30 });
    a = pa.keys; b = pb.keys; tenantA = pa.tenant.id;
  });
  afterAll(async () => { await db.close(); });

  it("provisioning creates working test and live keys scoped to the licensed packs", async () => {
    expect(a.test).toMatch(/^bk_test_/); expect(a.live).toMatch(/^bk_live_/);
    const packs = (await app.inject({ url: "/v1/packs", headers: hdr(a.test) })).json().packs;
    expect(packs.map((p: { id: string }) => p.id)).toEqual(["widgets"]);
    expect((await db.store.getTenant(pa()))?.retentionDays).toBe(365);
    function pa() { return tenantA; }
    const keys = (await app.inject({ url: "/v1/keys", headers: hdr(a.live) })).json().keys;
    expect(JSON.stringify(keys)).not.toContain(a.live);
    expect(keys).toHaveLength(2);
  });

  it("assesses, audits, meters and replays idempotently", async () => {
    const h = hdr(a.live, { "idempotency-key": "k-1" });
    const r1 = await app.inject({ method: "POST", url: "/v1/assess", headers: h, payload });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ outcome: "urgent", test_mode: false, pack: { id: "widgets", status: "beta" } });
    const r2 = await app.inject({ method: "POST", url: "/v1/assess", headers: h, payload });
    expect(r2.headers["idempotent-replayed"]).toBe("true");
    expect(r2.json().request_id).toBe(r1.json().request_id);
    expect((await app.inject({ method: "POST", url: "/v1/assess", headers: h, payload: { ...payload, jurisdiction: "NSW" } })).statusCode).toBe(409);

    const audit = (await app.inject({ url: `/v1/audit/${r1.json().request_id}`, headers: hdr(a.live) })).json();
    expect(audit).toMatchObject({ pack: { id: "widgets", version: "1.2.0" }, rule_versions: { "damage-vic": "1.0.0", "large-batch": "1.0.0" }, output: { outcome: "urgent" } });
    expect(JSON.stringify(audit)).not.toContain('"damaged"');

    const usage = (await app.inject({ url: "/v1/usage", headers: hdr(a.live) })).json().usage;
    expect(usage).toEqual([{ packId: "widgets", endpoint: "assess", test: false, count: 1 }]); // replay not billed
  });

  it("keeps tenants isolated", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/assess", headers: hdr(a.live), payload });
    const id = r.json().request_id;
    expect((await app.inject({ url: `/v1/audit/${id}`, headers: hdr(b.live) })).statusCode).toBe(404);
    expect((await app.inject({ url: "/v1/usage", headers: hdr(b.live) })).json().usage).toEqual([]);
    const aKey = (await app.inject({ url: "/v1/keys", headers: hdr(a.live) })).json().keys[0].id;
    expect((await app.inject({ method: "POST", url: `/v1/keys/${aKey}/revoke`, headers: hdr(b.live) })).statusCode).toBe(404);
  });

  it("delivers webhooks from the Postgres outbox, with a log, and cancels on delete", async () => {
    const reg = (await app.inject({ method: "POST", url: "/v1/webhooks", headers: hdr(a.live), payload: { url: "https://example.com/h", events: ["assessment.completed"], packs: ["widgets"] } })).json();
    expect(reg.id).toBeTruthy();
    await app.inject({ method: "POST", url: "/v1/assess", headers: hdr(a.live), payload });
    await app.webhooks.runDue();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ type: "assessment.completed", data: { outcome: "urgent" } });
    const log = (await app.inject({ url: `/v1/webhooks/${reg.id}/deliveries`, headers: hdr(a.live) })).json().deliveries;
    expect(log[0]).toMatchObject({ status: "succeeded", attempts: 1, last_status_code: 200 });
    await app.inject({ method: "DELETE", url: `/v1/webhooks/${reg.id}`, headers: hdr(a.live) });
    await app.inject({ method: "POST", url: "/v1/assess", headers: hdr(a.live), payload });
    expect(await app.webhooks.runDue()).toBe(0);
  });

  it("rotates and revokes keys durably", async () => {
    const created = (await app.inject({ method: "POST", url: "/v1/keys", headers: hdr(a.live), payload: { name: "ci", mode: "test", scopes: ["read"] } })).json();
    expect((await app.inject({ url: "/v1/usage", headers: hdr(created.key) })).statusCode).toBe(200);
    const rotated = (await app.inject({ method: "POST", url: `/v1/keys/${created.id}/rotate`, headers: hdr(a.live) })).json();
    expect((await app.inject({ url: "/v1/usage", headers: hdr(created.key) })).json().error.code).toBe("api_key_revoked");
    expect((await app.inject({ url: "/v1/usage", headers: hdr(rotated.key) })).statusCode).toBe(200);
  });

  it("erasing a tenant's data removes its audit records but not its keys or billing counts", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/assess", headers: hdr(a.live), payload });
    const id = r.json().request_id;
    expect((await app.inject({ url: `/v1/audit/${id}`, headers: hdr(a.live) })).statusCode).toBe(200);
    const erased = await db.store.eraseTenantData(tenantA);
    expect(erased.audit).toBeGreaterThan(0);
    expect((await app.inject({ url: `/v1/audit/${id}`, headers: hdr(a.live) })).statusCode).toBe(404);
    expect((await app.inject({ url: "/v1/usage", headers: hdr(a.live) })).json().usage.length).toBeGreaterThan(0);
  });
});

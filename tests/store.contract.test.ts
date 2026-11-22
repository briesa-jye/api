import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@briesa/db";
import { makePrismaStore, storeFactories } from "./storetools.ts";

const key = (tenantId: string, prefix: string, over: object = {}) => ({
  tenantId, name: "k", prefix, hash: "ab".repeat(32), mode: "live" as const, scopes: ["read", "pack:x"], rateLimitPerMinute: 60, rotatedFromId: null, ...over,
});
const audit = (tenantId: string, requestId: string, over: object = {}) => ({
  requestId, tenantId, keyId: "k", endpoint: "assess", packId: "p", packVersion: "1.0.0", ruleVersions: { r1: "1.0.0" },
  inputsHash: "h".repeat(64), output: { outcome: "x", nested: { a: [1, 2] } }, model: null, test: false, ...over,
});
const delivery = (tenantId: string, endpointId: string, nextAttemptAt: Date) => ({ tenantId, endpointId, event: "assessment.completed" as const, payload: "{}", nextAttemptAt });

for (const f of storeFactories) {
  describe(`Store contract: ${f.name}`, () => {
    let store: Store;
    let close: () => Promise<void>;
    let A: string, B: string;
    beforeEach(async () => {
      ({ store, close } = await f.make());
      A = (await store.createTenant({ name: "A" })).id;
      B = (await store.createTenant({ name: "B", retentionDays: 30 })).id;
    });
    afterEach(async () => { vi.useRealTimers(); await close(); });

    it("tenants: create, get, retention", async () => {
      expect(await store.getTenant(A)).toMatchObject({ name: "A", retentionDays: 365 });
      expect((await store.getTenant(B))?.retentionDays).toBe(30);
      expect(await store.getTenant("nope")).toBeNull();
      expect(await store.setTenantRetention(A, 90)).toBe(true);
      expect((await store.getTenant(A))?.retentionDays).toBe(90);
      expect(await store.setTenantRetention("nope", 1)).toBe(false);
    });

    it("api keys: find by prefix, tenant-scoped list and revoke, unique prefix", async () => {
      const k = await store.createApiKey(key(A, "aaaaaaaaaa"));
      await store.createApiKey(key(B, "bbbbbbbbbb", { mode: "test" }));
      expect(k).toMatchObject({ tenantId: A, scopes: ["read", "pack:x"], mode: "live", revokedAt: null });
      expect((await store.findApiKeyByPrefix("aaaaaaaaaa"))?.id).toBe(k.id);
      expect(await store.findApiKeyByPrefix("zzzzzzzzzz")).toBeNull();
      expect((await store.listApiKeys(A)).map((x) => x.prefix)).toEqual(["aaaaaaaaaa"]);
      expect(await store.revokeApiKey(B, k.id)).toBeNull(); // other tenant cannot revoke
      expect((await store.findApiKeyByPrefix("aaaaaaaaaa"))?.revokedAt).toBeNull();
      const r1 = await store.revokeApiKey(A, k.id);
      expect(r1?.revokedAt).toBeInstanceOf(Date);
      expect((await store.revokeApiKey(A, k.id))?.revokedAt?.getTime()).toBe(r1?.revokedAt?.getTime()); // idempotent
      await expect(store.createApiKey(key(B, "aaaaaaaaaa"))).rejects.toThrow();
    });

    it("usage: grouped by pack, endpoint and test flag; scoped by tenant and month", async () => {
      const u = (tenantId: string, over: object = {}) => store.recordUsage({ tenantId, keyId: "k", packId: "p1", endpoint: "assess", test: false, month: "2026-11", ...over });
      await u(A); await u(A); await u(A, { test: true }); await u(A, { packId: null }); await u(A, { month: "2026-10" }); await u(B);
      const rows = await store.usageSummary(A, "2026-11");
      const sorted = (r: typeof rows) => [...r].sort((x, y) => `${x.packId}${x.test}`.localeCompare(`${y.packId}${y.test}`));
      expect(sorted(rows)).toEqual(sorted([
        { packId: "p1", endpoint: "assess", test: false, count: 2 }, { packId: "p1", endpoint: "assess", test: true, count: 1 }, { packId: null, endpoint: "assess", test: false, count: 1 },
      ]));
      expect((await store.usageSummary(B, "2026-11"))[0]?.count).toBe(1);
      expect(await store.usageSummary(A, "2025-01")).toEqual([]);
    });

    it("audit: append, tenant-scoped read, JSON round trip, one record per request id per tenant", async () => {
      await store.appendAudit(audit(A, "req_1"));
      await store.appendAudit(audit(A, "req_nulls", { ruleVersions: null, output: null }));
      const got = await store.getAudit(A, "req_1");
      expect(got).toMatchObject({ requestId: "req_1", packVersion: "1.0.0", ruleVersions: { r1: "1.0.0" }, output: { outcome: "x", nested: { a: [1, 2] } }, test: false });
      expect(got?.createdAt).toBeInstanceOf(Date);
      expect(await store.getAudit(B, "req_1")).toBeNull();
      const n = await store.getAudit(A, "req_nulls");
      expect(n?.ruleVersions ?? null).toBeNull();
      expect(n?.output ?? null).toBeNull();
      await store.appendAudit(audit(B, "req_1")); // same request id, different tenant: fine
      expect(await store.getAudit(B, "req_1")).not.toBeNull();
    });

    it("idempotency: per tenant, first write wins, expires after 24h", async () => {
      const rec = (tenantId: string, body: string) => ({ tenantId, key: "k1", requestHash: "h", status: 200, responseBody: body });
      await store.saveIdempotency(rec(A, "first"));
      await store.saveIdempotency(rec(A, "second")); // duplicate is ignored, not an error
      expect((await store.getIdempotency(A, "k1"))?.responseBody).toBe("first");
      expect(await store.getIdempotency(B, "k1")).toBeNull();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 25 * 3600_000);
      expect(await store.getIdempotency(A, "k1")).toBeNull();
    });

    it("webhook endpoints: scoped by tenant, arrays round trip, system listing by event, disable cancels pending deliveries", async () => {
      const e = await store.createWebhookEndpoint({ tenantId: A, url: "https://a.example/h", events: ["rules.updated", "pack.updated"], packs: ["p1", "p2"], secret: "whsec_a" });
      const other = await store.createWebhookEndpoint({ tenantId: B, url: "https://b.example/h", events: ["assessment.completed"], packs: ["*"], secret: "whsec_b" });
      expect(e).toMatchObject({ events: ["rules.updated", "pack.updated"], packs: ["p1", "p2"], disabledAt: null });
      expect((await store.listWebhookEndpoints(A)).map((x) => x.id)).toEqual([e.id]);
      expect((await store.systemListWebhookEndpoints("rules.updated")).map((x) => x.id)).toEqual([e.id]);
      expect((await store.systemListWebhookEndpoints("assessment.completed")).map((x) => x.id)).toEqual([other.id]);
      expect((await store.systemGetWebhookEndpoint(e.id))?.secret).toBe("whsec_a");
      const d = await store.createWebhookDelivery(delivery(A, e.id, new Date()));
      expect(await store.disableWebhookEndpoint(B, e.id)).toBe(false);
      expect(await store.disableWebhookEndpoint(A, e.id)).toBe(true);
      expect(await store.disableWebhookEndpoint(A, e.id)).toBe(false);
      expect(await store.listWebhookEndpoints(A)).toEqual([]);
      expect(await store.systemListWebhookEndpoints("rules.updated")).toEqual([]);
      expect((await store.listWebhookDeliveries(A, e.id, 10))[0]).toMatchObject({ id: d.id, status: "failed", lastError: "endpoint deleted", nextAttemptAt: null });
      expect(await store.claimDueWebhookDeliveries(new Date(Date.now() + 1e6), 10, 1000)).toEqual([]);
    });

    it("deliveries: claim only due rows, leases prevent double claims, updates persist, listing is tenant-scoped newest first", async () => {
      const e = await store.createWebhookEndpoint({ tenantId: A, url: "https://a.example/h", events: ["assessment.completed"], packs: ["*"], secret: "s" });
      const t0 = new Date("2026-11-22T00:00:00Z");
      const due1 = await store.createWebhookDelivery(delivery(A, e.id, new Date(t0.getTime() - 2000)));
      const due2 = await store.createWebhookDelivery(delivery(A, e.id, new Date(t0.getTime() - 1000)));
      const later = await store.createWebhookDelivery(delivery(A, e.id, new Date(t0.getTime() + 60_000)));
      const first = await store.claimDueWebhookDeliveries(t0, 1, 300_000);
      expect(first.map((d) => d.id)).toEqual([due1.id]); // oldest first, honours limit
      const second = await store.claimDueWebhookDeliveries(t0, 10, 300_000);
      expect(second.map((d) => d.id)).toEqual([due2.id]); // due1 is leased
      expect(await store.claimDueWebhookDeliveries(t0, 10, 300_000)).toEqual([]);
      expect((await store.claimDueWebhookDeliveries(new Date(t0.getTime() + 301_000), 10, 300_000)).map((d) => d.id).sort()).toEqual([due1.id, due2.id, later.id].sort()); // leases expired, later now due
      await store.updateWebhookDelivery(due1.id, { status: "succeeded", attempts: 2, lastStatusCode: 204, lastError: null, nextAttemptAt: null, deliveredAt: t0 });
      const rows = await store.listWebhookDeliveries(A, e.id, 10);
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.id === due1.id)).toMatchObject({ status: "succeeded", attempts: 2, lastStatusCode: 204, nextAttemptAt: null });
      expect(await store.listWebhookDeliveries(B, e.id, 10)).toEqual([]);
      expect(await store.listWebhookDeliveries(A, e.id, 2)).toHaveLength(2);
    });

    it("retention: purges audit by each tenant's own retention, expired idempotency and old finished deliveries", async () => {
      await store.appendAudit(audit(A, "a1")); // tenant A keeps 365 days
      await store.appendAudit(audit(B, "b1")); // tenant B keeps 30 days
      await store.saveIdempotency({ tenantId: A, key: "k", requestHash: "h", status: 200, responseBody: "{}" });
      const e = await store.createWebhookEndpoint({ tenantId: A, url: "https://a.example/h", events: ["assessment.completed"], packs: ["*"], secret: "s" });
      const fin = await store.createWebhookDelivery(delivery(A, e.id, new Date()));
      await store.updateWebhookDelivery(fin.id, { status: "succeeded", nextAttemptAt: null });
      const pending = await store.createWebhookDelivery(delivery(A, e.id, new Date()));
      const day = 86_400_000;

      expect(await store.purgeExpired(new Date(Date.now() + 2 * day))).toEqual({ audit: 0, idempotency: 1, deliveries: 0 });
      expect(await store.purgeExpired(new Date(Date.now() + 60 * day))).toEqual({ audit: 1, idempotency: 0, deliveries: 1 });
      expect(await store.getAudit(B, "b1")).toBeNull();
      expect(await store.getAudit(A, "a1")).not.toBeNull();
      expect((await store.listWebhookDeliveries(A, e.id, 10)).map((d) => d.id)).toEqual([pending.id]); // pending is never purged
      expect((await store.purgeExpired(new Date(Date.now() + 400 * day))).audit).toBe(1);
      expect(await store.getAudit(A, "a1")).toBeNull();
    });

    it("billing: defaults, updates, array round trip, unique Stripe customer, lookup", async () => {
      expect(await store.getTenant(A)).toMatchObject({ billingExempt: false, subscriptionStatus: "none", stripeCustomerId: null, planId: null, licensedPacks: [], currentPeriodEnd: null });
      const end = new Date("2027-01-01T00:00:00Z");
      expect(await store.updateTenantBilling(A, { stripeCustomerId: "cus_1", subscriptionStatus: "active", subscriptionId: "sub_1", planId: "pro", licensedPacks: ["p1", "p2"], currentPeriodEnd: end })).toBe(true);
      expect(await store.getTenant(A)).toMatchObject({ subscriptionStatus: "active", planId: "pro", licensedPacks: ["p1", "p2"], stripeCustomerId: "cus_1" });
      expect((await store.getTenant(A))?.currentPeriodEnd?.getTime()).toBe(end.getTime());
      expect((await store.findTenantByStripeCustomer("cus_1"))?.id).toBe(A);
      expect(await store.findTenantByStripeCustomer("cus_none")).toBeNull();
      await expect(store.updateTenantBilling(B, { stripeCustomerId: "cus_1" })).rejects.toThrow();
      expect(await store.updateTenantBilling("nope", { planId: "x" })).toBe(false);
      expect((await store.createTenant({ name: "Exempt", billingExempt: true })).billingExempt).toBe(true);
    });

    it("members: first sign-in creates tenant and owner once, even concurrently; users stay separate", async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => store.ensureTenantForUser({ userId: "user-1", email: "a@example.com", tenantName: "Acme" })));
      expect(new Set(results.map((r) => r.tenant.id)).size).toBe(1);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      const again = await store.ensureTenantForUser({ userId: "user-1", email: "a@example.com", tenantName: "Ignored" });
      expect(again.created).toBe(false);
      expect(again.tenant.name).toBe("Acme");
      expect(again.member).toMatchObject({ userId: "user-1", email: "a@example.com", role: "owner" });
      const other = await store.ensureTenantForUser({ userId: "user-2", email: "b@example.com", tenantName: "Beta" });
      expect(other.tenant.id).not.toBe(again.tenant.id);
      expect((await store.findMembershipByUser("user-2"))?.tenant.name).toBe("Beta");
      expect(await store.findMembershipByUser("nobody")).toBeNull();
    });

    it("stripe events are claimed once", async () => {
      expect(await store.claimStripeEvent("evt_1")).toBe(true);
      expect(await store.claimStripeEvent("evt_1")).toBe(false);
      expect(await store.claimStripeEvent("evt_2")).toBe(true);
      await store.releaseStripeEvent("evt_1");
      expect(await store.claimStripeEvent("evt_1")).toBe(true); // released events can be claimed again
    });

    it("erasure: removes one tenant's assessment data and nothing else", async () => {
      await store.appendAudit(audit(A, "a1")); await store.appendAudit(audit(B, "b1"));
      await store.saveIdempotency({ tenantId: A, key: "k", requestHash: "h", status: 200, responseBody: "{}" });
      await store.recordUsage({ tenantId: A, keyId: "k", packId: "p", endpoint: "assess", test: false, month: "2026-11" });
      const e = await store.createWebhookEndpoint({ tenantId: A, url: "https://a.example/h", events: ["assessment.completed"], packs: ["*"], secret: "s" });
      await store.createWebhookDelivery(delivery(A, e.id, new Date()));
      expect(await store.eraseTenantData(A)).toEqual({ audit: 1, idempotency: 1, deliveries: 1 });
      expect(await store.getAudit(A, "a1")).toBeNull();
      expect(await store.getAudit(B, "b1")).not.toBeNull();
      expect(await store.usageSummary(A, "2026-11")).toHaveLength(1); // billing counts are kept
      expect(await store.listWebhookEndpoints(A)).toHaveLength(1);
    });
  });
}

describe("PrismaStore database guarantees", () => {
  let ctx: Awaited<ReturnType<typeof makePrismaStore>>;
  let A: string;
  beforeEach(async () => { ctx = await makePrismaStore(); A = (await ctx.store.createTenant({ name: "A" })).id; });
  afterEach(async () => { await ctx.close(); });

  it("audit records cannot be updated or deleted outside the retention path, even with raw SQL", async () => {
    await ctx.store.appendAudit(audit(A, "r1"));
    await expect(ctx.client.$executeRaw`UPDATE "AuditRecord" SET "endpoint" = 'tampered'`).rejects.toThrow(/immutable/);
    await expect(ctx.client.$executeRaw`DELETE FROM "AuditRecord"`).rejects.toThrow(/retention job/);
    await expect(ctx.client.auditRecord.deleteMany()).rejects.toThrow();
    expect((await ctx.store.getAudit(A, "r1"))?.endpoint).toBe("assess");
    expect((await ctx.store.eraseTenantData(A)).audit).toBe(1); // the sanctioned path still works
  });

  it("foreign keys stop rows for tenants that do not exist", async () => {
    await expect(ctx.store.appendAudit(audit("no-such-tenant", "r1"))).rejects.toThrow();
    await expect(ctx.store.recordUsage({ tenantId: "no-such-tenant", keyId: "k", packId: null, endpoint: "e", test: false, month: "2026-11" })).rejects.toThrow();
  });

  it("time handling is correct when the database session is not in UTC", async () => {
    await ctx.pg.exec("SET TIME ZONE 'Australia/Sydney'");
    const e = await ctx.store.createWebhookEndpoint({ tenantId: A, url: "https://a.example/h", events: ["assessment.completed"], packs: ["*"], secret: "s" });
    const t0 = new Date();
    await ctx.store.createWebhookDelivery(delivery(A, e.id, new Date(t0.getTime() - 1000)));
    await ctx.store.createWebhookDelivery(delivery(A, e.id, new Date(t0.getTime() + 3_600_000)));
    expect(await ctx.store.claimDueWebhookDeliveries(t0, 10, 1000)).toHaveLength(1); // not 0 or 2 despite +10/11h offset
    await ctx.store.appendAudit(audit(A, "r1"));
    await ctx.store.setTenantRetention(A, 1);
    expect((await ctx.store.purgeExpired(new Date(Date.now() + 3_600_000))).audit).toBe(0);
    expect((await ctx.store.purgeExpired(new Date(Date.now() + 25 * 3_600_000))).audit).toBe(1);
  });
});

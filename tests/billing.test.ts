import { effectiveScopes, liveAccessAllowed } from "@briesa/accounts/billing";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { generateKey } from "../apps/api/src/keys.ts";
import { makeWidgetPack } from "./packtools.ts";

async function boot() {
  const { root } = makeWidgetPack();
  const store = new MemoryStore();
  const app = await buildApp({ store, packs: PackRegistry.fromDir(root), tenantCacheMs: 0 });
  const t = await store.createTenant({ name: "Self-serve" }); // not billing exempt
  const mint = async (mode: "test" | "live", scopes = ["assess", "read", "keys:manage", "webhooks", "pack:*"]) => {
    const g = generateKey(mode);
    await store.createApiKey({ tenantId: t.id, name: "k", prefix: g.prefix, hash: g.hash, mode, scopes, rateLimitPerMinute: 1000, rotatedFromId: null });
    return { authorization: `Bearer ${g.key}` };
  };
  const live = await mint("live"), test = await mint("test");
  const payload = { pack: "widgets", scenario_type: "inspect", jurisdiction: "NSW", inputs: { count: 1 } };
  const assess = (h: object) => app.inject({ method: "POST", url: "/v1/assess", headers: h as Record<string, string>, payload });
  const packs = async (h: object) => (await app.inject({ url: "/v1/packs", headers: h as Record<string, string> })).json();
  return { app, store, t, live, test, assess, packs, mint };
}

describe("sandbox and subscription gating", () => {
  it("a tenant that never subscribed can use test keys on every pack but gets 402 on live keys", async () => {
    const { live, test, assess, packs } = await boot();
    expect((await assess(test)).statusCode).toBe(200);
    expect((await packs(test)).packs).toHaveLength(1);
    const r = await assess(live);
    expect(r.statusCode).toBe(402);
    expect(r.json().error).toMatchObject({ type: "permission_error", code: "subscription_required" });
    expect(r.json().error.request_id).toMatch(/^req_/);
  });

  it("live keys work while active, trialing or past_due, and stop when canceled, unpaid or incomplete", async () => {
    const { store, t, live, assess } = await boot();
    for (const [status, ok] of [["active", true], ["trialing", true], ["past_due", true], ["canceled", false], ["unpaid", false], ["incomplete", false], ["paused", false]] as const) {
      await store.updateTenantBilling(t.id, { subscriptionStatus: status, licensedPacks: ["*"] });
      expect((await assess(live)).statusCode, status).toBe(ok ? 200 : 402);
    }
  });

  it("billing changes apply to existing keys immediately (no re-issue)", async () => {
    const { store, t, live, assess } = await boot();
    expect((await assess(live)).statusCode).toBe(402);
    await store.updateTenantBilling(t.id, { subscriptionStatus: "active", licensedPacks: ["*"] });
    expect((await assess(live)).statusCode).toBe(200);
    await store.updateTenantBilling(t.id, { subscriptionStatus: "canceled" });
    expect((await assess(live)).statusCode).toBe(402);
  });

  it("a plan's licensed packs limit live keys, even if the key itself has pack:*", async () => {
    const { store, t, live, test, assess, packs } = await boot();
    await store.updateTenantBilling(t.id, { subscriptionStatus: "active", licensedPacks: ["some-other-pack"] });
    expect((await packs(live)).packs).toEqual([]);
    const r = await assess(live);
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("pack_not_found");
    expect((await assess(test)).statusCode).toBe(200); // sandbox is unaffected by licensing
    await store.updateTenantBilling(t.id, { licensedPacks: ["widgets"] });
    expect((await assess(live)).statusCode).toBe(200);
  });

  it("billing-exempt tenants ignore subscription state", async () => {
    const { store, t, live, assess } = await boot();
    await store.updateTenantBilling(t.id, { billingExempt: true, subscriptionStatus: "none", licensedPacks: [] });
    expect((await assess(live)).statusCode).toBe(200);
  });

  it("cannot mint live keys without a subscription, but test keys are free", async () => {
    const { app, store, t, test, live } = await boot();
    const mk = (h: object, mode: string) => app.inject({ method: "POST", url: "/v1/keys", headers: h as Record<string, string>, payload: { name: "n", mode, scopes: ["read"] } });
    expect((await mk(test, "test")).statusCode).toBe(201);
    const r = await mk(test, "live");
    expect(r.statusCode).toBe(402);
    expect(r.json().error.code).toBe("subscription_required");
    await store.updateTenantBilling(t.id, { subscriptionStatus: "active", licensedPacks: ["*"] });
    expect((await mk(live, "live")).statusCode).toBe(201);
  });

  it("402 is not metered as billable usage", async () => {
    const { store, t, live, test, assess, app } = await boot();
    await assess(live);
    await assess(test);
    await store.updateTenantBilling(t.id, { subscriptionStatus: "active", licensedPacks: ["*"] });
    const usage = (await app.inject({ url: "/v1/usage", headers: live })).json().usage;
    expect(usage).toEqual([{ packId: "widgets", endpoint: "assess", test: true, count: 1 }]);
  });
});

describe("effectiveScopes and liveAccessAllowed", () => {
  const sub = (licensedPacks: string[]) => ({ billingExempt: false, licensedPacks });
  it("filters pack scopes by licence for live keys only", () => {
    expect(effectiveScopes(["read", "pack:a", "pack:b"], sub(["a"]), "live").sort()).toEqual(["pack:a", "read"]);
    expect(effectiveScopes(["read", "pack:*"], sub(["a", "b"]), "live").sort()).toEqual(["pack:a", "pack:b", "read"]);
    expect(effectiveScopes(["pack:*"], sub(["*"]), "live")).toEqual(["pack:*"]);
    expect(effectiveScopes(["pack:a"], sub([]), "live")).toEqual([]);
    expect(effectiveScopes(["read", "pack:zzz"], sub([]), "test")).toEqual(["read", "pack:zzz"]);
    expect(effectiveScopes(["pack:zzz"], { billingExempt: true, licensedPacks: [] }, "live")).toEqual(["pack:zzz"]);
  });
  it("expands the wildcard scope to the licensed packs instead of granting everything", () => {
    const s = effectiveScopes(["*"], sub(["a"]), "live");
    expect(s).toContain("pack:a");
    expect(s).not.toContain("pack:*");
    expect(s).not.toContain("*");
  });
  it("live access rules", () => {
    expect(liveAccessAllowed({ billingExempt: false, subscriptionStatus: "none" })).toBe(false);
    expect(liveAccessAllowed({ billingExempt: true, subscriptionStatus: "none" })).toBe(true);
    expect(liveAccessAllowed({ billingExempt: false, subscriptionStatus: "active" })).toBe(true);
  });
});

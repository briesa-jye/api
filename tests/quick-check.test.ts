import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { buildApp } from "../apps/api/src/app.ts";
import { generateKey } from "../apps/api/src/keys.ts";
import { actorOf, runCheck } from "../apps/web/src/lib/check.ts";

const packsDir = resolve(import.meta.dirname, "../packs");
const registry = PackRegistry.fromDir(packsDir);
const pack = registry.get("whs-incident-notification")!;
const sc = pack.scenarios[0]!;
const req = { pack: pack.manifest.id, scenario_type: sc.scenario_type, jurisdiction: sc.jurisdiction, inputs: sc.inputs as Record<string, unknown> };
const user = { email: "agent@example.com" };

const setup = async (over: { billingExempt?: boolean; licensedPacks?: string[] } = {}) => {
  const store = new MemoryStore();
  const tenant = await store.createTenant({ name: "T", billingExempt: over.billingExempt ?? true });
  const t = over.licensedPacks ? { ...tenant, licensedPacks: over.licensedPacks } : tenant;
  return { store, tenant: t };
};

describe("dashboard quick check", () => {
  it("gives the same answer as the API, and is saved to Audit under the employee", async () => {
    const { store, tenant } = await setup();
    const r = await runCheck(store, tenant, user, pack, { ...req, reference: " matter-42 " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // The same request through the real API.
    const apiStore = new MemoryStore();
    const apiApp = await buildApp({ store: apiStore, packs: registry });
    const t2 = await apiStore.createTenant({ name: "T2", billingExempt: true });
    const g = generateKey("live");
    await apiStore.createApiKey({ tenantId: t2.id, name: "k", prefix: g.prefix, hash: g.hash, mode: "live", scopes: ["assess", "pack:*"], rateLimitPerMinute: 600, rotatedFromId: null });
    const viaApi = (await apiApp.inject({ method: "POST", url: "/v1/assess", headers: { authorization: `Bearer ${g.key}`, "content-type": "application/json" }, payload: JSON.stringify(req) })).json();
    for (const k of ["outcome", "required_actions", "missing_information", "escalation_recommended", "reasons", "pack", "as_of", "disclaimer", "human_review_recommended"] as const) {
      expect(r.result[k], k).toEqual(viaApi[k]);
    }

    const rec = await store.getAudit(tenant.id, r.result.request_id);
    expect(rec).toMatchObject({ endpoint: "assess", packId: pack.manifest.id, reference: "matter-42", test: false });
    expect(actorOf(rec!.keyId)).toBe("agent@example.com");
    expect(rec!.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rec)).not.toContain(JSON.stringify(sc.inputs)); // raw inputs are never stored
    const usage = await store.usageSummary(tenant.id, new Date().toISOString().slice(0, 7));
    expect(usage).toEqual([{ packId: pack.manifest.id, endpoint: "assess", test: false, count: 1 }]);
  });

  it("runs in test mode, unbilled in effect, when the account has no subscription", async () => {
    const { store, tenant } = await setup({ billingExempt: false });
    const r = await runCheck(store, { ...tenant, licensedPacks: ["*"] }, user, pack, req);
    expect(r.ok && r.result.test_mode).toBe(true);
    expect((await store.getAudit(tenant.id, (r as { result: { request_id: string } }).result.request_id))?.test).toBe(true);
  });

  it("refuses a pack the plan does not license, a missing pack, and bad requests, and records nothing", async () => {
    const { store, tenant } = await setup({ billingExempt: false });
    const live = { ...tenant, subscriptionStatus: "active" as const, licensedPacks: ["some-other-pack"] };
    expect(await runCheck(store, live, user, pack, req)).toEqual({ ok: false, error: "That check is not available on your plan." });
    expect((await runCheck(store, tenant, user, undefined, req)).ok).toBe(false);
    for (const bad of [{ ...req, jurisdiction: "XX" }, { ...req, inputs: null }, { ...req, inputs: [] }, { ...req, as_of: "tomorrow" }, { ...req, scenario_type: "nope" }, { ...req, inputs: {} }]) {
      expect((await runCheck(store, tenant, user, pack, bad as never)).ok, JSON.stringify(bad).slice(0, 40)).toBe(false);
    }
    expect(await store.listAudit(tenant.id, { limit: 10 })).toHaveLength(0);
    expect(await store.usageSummary(tenant.id, new Date().toISOString().slice(0, 7))).toEqual([]);
  });

  it("tells an API key's audit record apart from an employee's", () => {
    expect(actorOf("user:a@b.co")).toBe("a@b.co");
    expect(actorOf("ckx123")).toBeNull();
  });
});

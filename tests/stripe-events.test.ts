import { parsePlans } from "@briesa/accounts/plans";
import { applyStripeEvent, type StripeEventLike } from "@briesa/accounts/stripe-events";
import { MemoryStore } from "@briesa/db";
import { beforeEach, describe, expect, it } from "vitest";

const plans = parsePlans(JSON.stringify([
  { id: "starter", name: "Starter", priceId: "price_starter", packs: ["whs-incident-notification"] },
  { id: "pro", name: "Pro", priceId: "price_pro", packs: ["*"] },
]));
const sub = (over: Record<string, any> = {}) => ({ id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_800_000_000 }] }, ...over });
let n = 0;
const ev = (type: string, object: Record<string, any>, created = 1_700_000_000 + n): StripeEventLike => ({ id: `evt_${++n}`, type, created, data: { object } });

describe("plans config", () => {
  it("parses valid plans and treats empty config as no plans", () => {
    expect(plans).toHaveLength(2);
    expect(parsePlans(undefined)).toEqual([]);
    expect(parsePlans("  ")).toEqual([]);
  });
  it("rejects invalid, unknown-field and duplicate plans loudly", () => {
    expect(() => parsePlans("nope")).toThrow(/not valid JSON/);
    expect(() => parsePlans(JSON.stringify([{ id: "x", name: "X", priceId: "prod_1", packs: ["a"] }]))).toThrow(/invalid/);
    expect(() => parsePlans(JSON.stringify([{ id: "x", name: "X", priceId: "price_1", packs: [] }]))).toThrow();
    expect(() => parsePlans(JSON.stringify([{ id: "x", name: "X", priceId: "price_1", packs: ["a"], free: true }]))).toThrow();
    const dup = { id: "x", name: "X", priceId: "price_1", packs: ["a"] };
    expect(() => parsePlans(JSON.stringify([dup, dup]))).toThrow(/duplicate/);
  });
});

describe("applyStripeEvent", () => {
  let store: MemoryStore;
  let tenantId: string;
  beforeEach(async () => { store = new MemoryStore(); tenantId = (await store.createTenant({ name: "T" })).id; });

  const link = () => applyStripeEvent(store, plans, ev("checkout.session.completed", { mode: "subscription", client_reference_id: tenantId, customer: "cus_1", subscription: "sub_1" }));

  it("links the customer on checkout completion", async () => {
    expect(await link()).toEqual({ handled: true, action: "customer_linked", tenantId });
    expect(await store.getTenant(tenantId)).toMatchObject({ stripeCustomerId: "cus_1", subscriptionId: "sub_1", subscriptionStatus: "none" });
  });

  it("syncs status, plan, licensed packs and period end from a subscription event", async () => {
    await link();
    expect((await applyStripeEvent(store, plans, ev("customer.subscription.created", sub()))).handled).toBe(true);
    const t = await store.getTenant(tenantId);
    expect(t).toMatchObject({ subscriptionStatus: "active", planId: "pro", licensedPacks: ["*"], subscriptionId: "sub_1" });
    expect(t?.currentPeriodEnd?.getTime()).toBe(1_800_000_000_000);
  });

  it("switching plan changes the licensed packs", async () => {
    await link();
    await applyStripeEvent(store, plans, ev("customer.subscription.updated", sub(), 1_700_000_100));
    await applyStripeEvent(store, plans, ev("customer.subscription.updated", sub({ items: { data: [{ price: { id: "price_starter" } }] } }), 1_700_000_200));
    expect(await store.getTenant(tenantId)).toMatchObject({ planId: "starter", licensedPacks: ["whs-incident-notification"] });
  });

  it("an unknown price licenses nothing; an unknown status becomes incomplete", async () => {
    await link();
    await applyStripeEvent(store, plans, ev("customer.subscription.updated", sub({ items: { data: [{ price: { id: "price_mystery" } }] } })));
    expect(await store.getTenant(tenantId)).toMatchObject({ planId: null, licensedPacks: [] });
    await applyStripeEvent(store, plans, ev("customer.subscription.updated", sub({ status: "something_new" })));
    expect((await store.getTenant(tenantId))?.subscriptionStatus).toBe("incomplete");
  });

  it("cancellation removes the plan and packs", async () => {
    await link();
    await applyStripeEvent(store, plans, ev("customer.subscription.updated", sub(), 1_700_000_100));
    const r = await applyStripeEvent(store, plans, ev("customer.subscription.deleted", sub({ status: "canceled" }), 1_700_000_200));
    expect(r).toMatchObject({ handled: true, action: "subscription_canceled" });
    expect(await store.getTenant(tenantId)).toMatchObject({ subscriptionStatus: "canceled", planId: null, licensedPacks: [] });
  });

  it("replays are ignored, and out-of-order events cannot roll state back", async () => {
    await link();
    const newer = ev("customer.subscription.updated", sub(), 1_700_000_500);
    expect((await applyStripeEvent(store, plans, newer)).handled).toBe(true);
    expect(await applyStripeEvent(store, plans, newer)).toEqual({ handled: false, reason: "duplicate" });
    const older = ev("customer.subscription.created", sub({ status: "incomplete" }), 1_700_000_100);
    expect(await applyStripeEvent(store, plans, older)).toEqual({ handled: false, reason: "stale_event" });
    expect((await store.getTenant(tenantId))?.subscriptionStatus).toBe("active");
  });

  it("a subscription event can arrive before checkout.session.completed if it carries the tenant id", async () => {
    const r = await applyStripeEvent(store, plans, ev("customer.subscription.created", sub({ metadata: { tenant_id: tenantId } })));
    expect(r).toMatchObject({ handled: true, tenantId });
    expect((await store.getTenant(tenantId))?.stripeCustomerId).toBe("cus_1");
  });

  it("ignores irrelevant types and unknown customers without error", async () => {
    expect(await applyStripeEvent(store, plans, ev("invoice.paid", {}))).toEqual({ handled: false, reason: "ignored_type" });
    expect(await applyStripeEvent(store, plans, ev("customer.subscription.updated", sub({ customer: "cus_stranger" })))).toEqual({ handled: false, reason: "unknown_customer" });
    expect(await applyStripeEvent(store, plans, ev("checkout.session.completed", { mode: "payment", client_reference_id: tenantId, customer: "cus_1" }))).toEqual({ handled: false, reason: "unknown_tenant" });
    expect(await applyStripeEvent(store, plans, ev("checkout.session.completed", { mode: "subscription", client_reference_id: "no-such-tenant", customer: "cus_1" }))).toEqual({ handled: false, reason: "unknown_tenant" });
  });

  it("will not relink a tenant to a different Stripe customer", async () => {
    await link();
    const r = await applyStripeEvent(store, plans, ev("checkout.session.completed", { mode: "subscription", client_reference_id: tenantId, customer: "cus_other", subscription: "sub_x" }));
    expect(r).toEqual({ handled: false, reason: "customer_conflict" });
    expect((await store.getTenant(tenantId))?.stripeCustomerId).toBe("cus_1");
  });

  it("releases the event when processing fails so Stripe's retry is processed", async () => {
    await link();
    const failing = ev("customer.subscription.updated", sub(), 1_700_000_900);
    const real = store.updateTenantBilling.bind(store);
    store.updateTenantBilling = async () => { throw new Error("db down"); };
    await expect(applyStripeEvent(store, plans, failing)).rejects.toThrow("db down");
    store.updateTenantBilling = real;
    expect((await applyStripeEvent(store, plans, failing)).handled).toBe(true); // not dropped as a duplicate
    expect((await store.getTenant(tenantId))?.subscriptionStatus).toBe("active");
  });

  it("an active subscription actually unlocks live keys through the same rules the API uses", async () => {
    const { liveAccessAllowed } = await import("@briesa/accounts/billing");
    expect(liveAccessAllowed((await store.getTenant(tenantId))!)).toBe(false);
    await link();
    await applyStripeEvent(store, plans, ev("customer.subscription.created", sub()));
    expect(liveAccessAllowed((await store.getTenant(tenantId))!)).toBe(true);
    await applyStripeEvent(store, plans, ev("customer.subscription.updated", sub({ status: "unpaid" }), 1_700_001_000));
    expect(liveAccessAllowed((await store.getTenant(tenantId))!)).toBe(false);
  });
});

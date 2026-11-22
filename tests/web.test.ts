import { MemoryStore } from "@briesa/db";
import Stripe from "stripe";
import { beforeAll, describe, expect, it } from "vitest";

const SECRET = "whsec_test_secret";
const PLANS = JSON.stringify([{ id: "pro", name: "Pro", priceId: "price_pro", packs: ["*"] }]);
let POST: (req: Request) => Promise<Response>;
let store: MemoryStore;
let tenantId: string;

beforeAll(async () => {
  Object.assign(process.env, { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: SECRET, BRIESA_PLANS: PLANS });
  delete process.env.DATABASE_URL;
  const { getStore } = await import("@/lib/store");
  store = getStore() as MemoryStore;
  tenantId = (await store.createTenant({ name: "Web test" })).id;
  ({ POST } = await import("@/app/api/stripe/webhook/route"));
});

const evt = (id: string, type: string, object: object, created = Math.floor(Date.now() / 1000)) => JSON.stringify({ id, object: "event", type, created, data: { object } });
const post = (payload: string, header?: string) =>
  POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: header ? { "stripe-signature": header } : {} }));
const signed = (payload: string) => Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

describe("Stripe webhook endpoint", () => {
  it("rejects missing and invalid signatures without touching any tenant", async () => {
    const body = evt("evt_a", "customer.subscription.updated", { id: "sub_x", customer: "cus_w", status: "active", metadata: { tenant_id: tenantId }, items: { data: [{ price: { id: "price_pro" } }] } });
    expect((await post(body)).status).toBe(400);
    expect((await post(body, "t=1,v1=deadbeef")).status).toBe(400);
    expect((await post(body, Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_wrong" }))).status).toBe(400);
    expect((await store.getTenant(tenantId))?.subscriptionStatus).toBe("none");
  });

  it("a tampered body fails verification", async () => {
    const body = evt("evt_b", "customer.subscription.updated", { id: "sub_x", customer: "cus_w", status: "active" });
    expect((await post(body.replace("active", "trialing"), signed(body))).status).toBe(400);
  });

  it("a correctly signed subscription event activates the tenant, and a replay is a harmless no-op", async () => {
    const sub = { id: "sub_1", customer: "cus_w", status: "active", metadata: { tenant_id: tenantId }, items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_900_000_000 }] } };
    const body = evt("evt_c", "customer.subscription.created", sub);
    const r = await post(body, signed(body));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true, handled: true });
    expect(await store.getTenant(tenantId)).toMatchObject({ subscriptionStatus: "active", planId: "pro", licensedPacks: ["*"], stripeCustomerId: "cus_w" });
    const again = await post(body, signed(body));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ received: true, handled: false });
  });

  it("acknowledges event types it ignores so Stripe does not retry them", async () => {
    const body = evt("evt_d", "invoice.paid", {});
    const r = await post(body, signed(body));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true, handled: false });
  });

  it("returns 500 when processing fails so Stripe retries, and the retry succeeds", async () => {
    const body = evt("evt_e", "customer.subscription.updated", { id: "sub_1", customer: "cus_w", status: "past_due", items: { data: [{ price: { id: "price_pro" } }] } });
    const real = store.updateTenantBilling.bind(store);
    store.updateTenantBilling = async () => { throw new Error("db down"); };
    expect((await post(body, signed(body))).status).toBe(500);
    store.updateTenantBilling = real;
    expect((await post(body, signed(body))).status).toBe(200);
    expect((await store.getTenant(tenantId))?.subscriptionStatus).toBe("past_due");
  });
});

describe("sameOriginPath", () => {
  it("only allows same-site relative paths", async () => {
    const { sameOriginPath } = await import("@/lib/redirect");
    expect(sameOriginPath("/dashboard/keys")).toBe("/dashboard/keys");
    expect(sameOriginPath("/dashboard/billing?plan=pro")).toBe("/dashboard/billing?plan=pro");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", null, undefined, "/ok\nSet-Cookie: x=1"]) {
      expect(sameOriginPath(bad as string | null | undefined), String(bad)).toBe("/dashboard");
    }
    expect(sameOriginPath("//evil.example", "/login")).toBe("/login");
  });
});

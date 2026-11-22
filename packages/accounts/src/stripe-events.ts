import { SUBSCRIPTION_STATUSES, type Store } from "@briesa/db";
import { planForPrice, type Plan } from "./plans.ts";

/** The subset of a Stripe event this code reads. The web app verifies the signature, then passes this in. */
export interface StripeEventLike {
  id: string;
  type: string;
  /** Unix seconds. */
  created: number;
  data: { object: Record<string, any> };
}

export type StripeResult =
  | { handled: true; action: string; tenantId: string }
  | { handled: false; reason: "duplicate" | "ignored_type" | "unknown_customer" | "stale_event" | "customer_conflict" | "unknown_tenant" };

const toDate = (sec: unknown) => (typeof sec === "number" ? new Date(sec * 1000) : null);

function snapshot(sub: Record<string, any>, plans: Plan[]) {
  const item = sub.items?.data?.[0];
  const plan = planForPrice(plans, item?.price?.id);
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status) ? (sub.status as string) : "incomplete";
  // An unknown price licenses nothing: safer than guessing.
  return {
    subscriptionId: sub.id as string,
    subscriptionStatus: status,
    planId: plan?.id ?? null,
    licensedPacks: plan?.packs ?? [],
    currentPeriodEnd: toDate(item?.current_period_end ?? sub.current_period_end),
  };
}

/**
 * Applies a verified Stripe event to the tenant it belongs to. Idempotent (event ids are claimed once) and
 * ordering-safe (an event older than the last one applied is ignored). Never throws on unknown or irrelevant
 * events, so Stripe is not told to retry what we will never act on.
 */
export async function applyStripeEvent(store: Store, plans: Plan[], event: StripeEventLike): Promise<StripeResult> {
  const relevant = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
  if (!relevant.includes(event.type)) return { handled: false, reason: "ignored_type" };
  if (!(await store.claimStripeEvent(event.id))) return { handled: false, reason: "duplicate" };
  try { return await process(store, plans, event); }
  catch (e) { await store.releaseStripeEvent(event.id); throw e; } // let Stripe's retry be processed
}

async function process(store: Store, plans: Plan[], event: StripeEventLike): Promise<StripeResult> {
  const obj = event.data.object;
  const at = new Date(event.created * 1000);

  if (event.type === "checkout.session.completed") {
    // Links the Stripe customer to the tenant that started checkout (client_reference_id = tenant id).
    const tenantId = obj.client_reference_id as string | undefined;
    const customer = obj.customer as string | undefined;
    if (obj.mode !== "subscription" || !tenantId || !customer) return { handled: false, reason: "unknown_tenant" };
    const tenant = await store.getTenant(tenantId);
    if (!tenant) return { handled: false, reason: "unknown_tenant" };
    if (tenant.stripeCustomerId && tenant.stripeCustomerId !== customer) return { handled: false, reason: "customer_conflict" };
    await store.updateTenantBilling(tenant.id, { stripeCustomerId: customer, ...(obj.subscription ? { subscriptionId: obj.subscription as string } : {}) });
    return { handled: true, action: "customer_linked", tenantId: tenant.id };
  }

  const customer = obj.customer as string | undefined;
  let tenant = customer ? await store.findTenantByStripeCustomer(customer) : null;
  if (!tenant && obj.metadata?.tenant_id) { // subscription events can arrive before checkout.session.completed
    const t = await store.getTenant(obj.metadata.tenant_id as string);
    if (t && (!t.stripeCustomerId || t.stripeCustomerId === customer)) tenant = t;
  }
  if (!tenant) return { handled: false, reason: "unknown_customer" };
  if (tenant.billingEventAt && at < tenant.billingEventAt) return { handled: false, reason: "stale_event" };

  if (event.type === "customer.subscription.deleted") {
    await store.updateTenantBilling(tenant.id, { stripeCustomerId: customer, subscriptionStatus: "canceled", planId: null, licensedPacks: [], currentPeriodEnd: toDate(obj.items?.data?.[0]?.current_period_end ?? obj.current_period_end), billingEventAt: at });
    return { handled: true, action: "subscription_canceled", tenantId: tenant.id };
  }
  await store.updateTenantBilling(tenant.id, { stripeCustomerId: customer, ...snapshot(obj, plans), billingEventAt: at });
  return { handled: true, action: "subscription_synced", tenantId: tenant.id };
}

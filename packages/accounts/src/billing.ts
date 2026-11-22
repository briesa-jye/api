import type { KeyMode, Tenant } from "@briesa/db";

/**
 * Subscription statuses that allow live keys. past_due is allowed while Stripe retries the payment;
 * canceled, unpaid, incomplete, paused and "none" (never subscribed) are not.
 */
export const LIVE_ALLOWED_STATUSES = ["active", "trialing", "past_due"] as const;

type BillingFields = Pick<Tenant, "billingExempt" | "subscriptionStatus">;

export const liveAccessAllowed = (t: BillingFields) => t.billingExempt || (LIVE_ALLOWED_STATUSES as readonly string[]).includes(t.subscriptionStatus);

const NON_PACK_SCOPES = ["assess", "read", "audit:read", "keys:manage", "webhooks"];

/**
 * The scopes a key really has. Test keys (the free sandbox) and billing-exempt tenants use the key's own scopes.
 * For subscribed tenants' live keys, pack scopes are intersected with the packs the subscription licenses, so a
 * plan change takes effect on existing keys immediately.
 */
export function effectiveScopes(scopes: string[], tenant: Pick<Tenant, "billingExempt" | "licensedPacks">, mode: KeyMode): string[] {
  if (mode === "test" || tenant.billingExempt) return scopes;
  const all = tenant.licensedPacks.includes("*");
  const licensed = (id: string) => all || tenant.licensedPacks.includes(id);
  const packsOf = () => (all ? ["pack:*"] : tenant.licensedPacks.map((p) => `pack:${p}`));
  const out = new Set<string>();
  for (const s of scopes) {
    if (s === "*") { NON_PACK_SCOPES.forEach((x) => out.add(x)); packsOf().forEach((x) => out.add(x)); }
    else if (s === "pack:*") packsOf().forEach((x) => out.add(x));
    else if (s.startsWith("pack:")) { if (licensed(s.slice(5))) out.add(s); }
    else out.add(s);
  }
  return [...out];
}

import { z } from "zod";

export const planSchema = z.strictObject({
  /** Stable internal id, stored on the tenant. */
  id: z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
  name: z.string().min(1),
  /** Stripe Price id (price_...). Prices and currency live in Stripe, never in code. */
  priceId: z.string().regex(/^price_/),
  /** Pack ids the plan licenses, or ["*"] for every pack. */
  packs: z.array(z.string().min(1)).min(1),
  description: z.string().optional(),
});
export type Plan = z.infer<typeof planSchema>;

/**
 * Plans come from the BRIESA_PLANS environment variable (a JSON array), so prices and pack bundles can change
 * without a code change. Invalid configuration throws: a misconfigured plan must never silently license packs.
 */
export function parsePlans(raw: string | undefined): Plan[] {
  if (!raw?.trim()) return [];
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new Error("BRIESA_PLANS is not valid JSON"); }
  const parsed = z.array(planSchema).safeParse(json);
  if (!parsed.success) throw new Error(`BRIESA_PLANS is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const ids = new Set<string>(), prices = new Set<string>();
  for (const p of parsed.data) {
    if (ids.has(p.id) || prices.has(p.priceId)) throw new Error(`BRIESA_PLANS has a duplicate id or price: ${p.id}`);
    ids.add(p.id); prices.add(p.priceId);
  }
  return parsed.data;
}

export const planForPrice = (plans: Plan[], priceId: string | undefined) => plans.find((p) => p.priceId === priceId) ?? null;
export const planById = (plans: Plan[], id: string | null | undefined) => plans.find((p) => p.id === id) ?? null;

import "server-only";
import Stripe from "stripe";

let client: Stripe | undefined;
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

export interface DisplayPrice { amount: number; currency: string; interval: string | null }

/** Prices live in Stripe. Returns null if Stripe is not configured or the lookup fails, so pages still render. */
export async function priceFor(priceId: string): Promise<DisplayPrice | null> {
  if (!stripeConfigured()) return null;
  try {
    const p = await getStripe().prices.retrieve(priceId);
    return p.unit_amount == null ? null : { amount: p.unit_amount / 100, currency: p.currency.toUpperCase(), interval: p.recurring?.interval ?? null };
  } catch { return null; }
}

export const formatPrice = (p: DisplayPrice) =>
  `${new Intl.NumberFormat("en-AU", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.amount)}${p.interval ? ` per ${p.interval}` : ""}`;

import { applyStripeEvent } from "@briesa/accounts/stripe-events";
import { getPlans } from "@/lib/account";
import { getStore } from "@/lib/store";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe calls this. The signature is verified against the raw body before anything is trusted. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return new Response("not configured", { status: 400 });

  const raw = await req.text();
  let event;
  try { event = getStripe().webhooks.constructEvent(raw, sig, secret); }
  catch { return new Response("invalid signature", { status: 400 }); }

  try {
    const result = await applyStripeEvent(getStore(), getPlans(), { id: event.id, type: event.type, created: event.created, data: { object: event.data.object as unknown as Record<string, unknown> } });
    return Response.json({ received: true, handled: result.handled });
  } catch (e) {
    console.error("stripe webhook processing failed", (e as Error).name);
    return new Response("processing failed", { status: 500 }); // Stripe retries; the event claim was released
  }
}

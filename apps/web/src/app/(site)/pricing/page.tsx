import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getPlans } from "@/lib/account";
import { SUPPORT_EMAIL } from "@/lib/site";
import { formatPrice, priceFor } from "@/lib/stripe";

export const metadata: Metadata = { title: "Pricing", description: "A free sandbox with test keys, and subscriptions for live keys." };
export const revalidate = 300;

const SANDBOX = ["Test keys on every pack", "Same logic as live keys", "No card needed", "Responses are flagged as test mode"];
const LIVE = ["Live keys for your production traffic", "Packs included in your plan", "Webhooks, audit records and usage reporting", "Manage or cancel any time in the billing portal"];

export default async function PricingPage() {
  const plans = getPlans();
  const priced = await Promise.all(plans.map(async (p) => ({ plan: p, price: await priceFor(p.priceId) })));

  return (
    <div className="container py-12 md:py-16">
      <h1 className="text-4xl tracking-tighter md:text-5xl">Pricing</h1>
      <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">Build and test for free. Subscribe when you are ready to send live traffic.</p>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="bg-card flex flex-col rounded-xl border p-7">
          <h2 className="font-display text-xl">Sandbox</h2>
          <p className="mt-3 text-3xl tracking-tighter">Free</p>
          <ul className="text-muted-foreground mt-6 space-y-3 text-sm">
            {SANDBOX.map((x) => (<li key={x} className="flex gap-2"><Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden />{x}</li>))}
          </ul>
          <Button asChild variant="outline" size="lg" className="mt-8"><Link href="/signup">Get a test key</Link></Button>
        </div>

        <div className="bg-accent-subtle flex flex-col rounded-xl border p-7">
          <h2 className="font-display text-xl">Live access</h2>
          {priced.length === 0 ? (
            <>
              <p className="mt-3 text-3xl tracking-tighter">Pricing is being finalised</p>
              <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed">
                Tell us what you are building and which packs you need, and we will come back with a plan.
              </p>
            </>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {priced.map(({ plan, price }) => (
                <div key={plan.id} className="bg-background/40 rounded-lg border p-5">
                  <h3 className="font-display text-base">{plan.name}</h3>
                  <p className="mt-2 text-2xl tracking-tighter">{price ? formatPrice(price) : "Contact us"}</p>
                  {plan.description && <p className="text-muted-foreground mt-2 text-sm">{plan.description}</p>}
                  <p className="text-muted-foreground mt-3 text-xs">{plan.packs.includes("*") ? "Every pack" : `${plan.packs.length} pack${plan.packs.length === 1 ? "" : "s"}`}</p>
                  <Button asChild variant="brand" className="mt-4 w-full"><Link href={`/dashboard/billing?plan=${plan.id}`}>Subscribe</Link></Button>
                </div>
              ))}
            </div>
          )}
          <ul className="text-muted-foreground mt-6 space-y-3 text-sm">
            {LIVE.map((x) => (<li key={x} className="flex gap-2"><Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden />{x}</li>))}
          </ul>
          {priced.length === 0 && (
            <Button asChild variant="brand" size="lg" className="mt-8 w-fit"><a href={`mailto:${SUPPORT_EMAIL}?subject=Briesa%20API%20live%20access`}>Talk to us</a></Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground mt-8 max-w-2xl text-xs leading-relaxed">
        Decision support, not legal advice. Both live packs are drafts. A plan gives you access to packs at their current status, not a guarantee of compliance.
      </p>
    </div>
  );
}

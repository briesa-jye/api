import { liveAccessAllowed } from "@briesa/accounts/billing";
import { planById } from "@briesa/accounts/plans";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/input";
import { openPortal, startCheckout } from "@/app/dashboard/actions";
import { getPlans, requireAccount } from "@/lib/account";
import { SUPPORT_EMAIL } from "@/lib/site";
import { formatPrice, priceFor, stripeConfigured } from "@/lib/stripe";
import { formatDate } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  unavailable: "Billing is not available right now. Please try again shortly or contact us.",
  exempt: "Your account is provisioned by Briesa and does not need a subscription.",
  already_subscribed: "You already have a subscription. Use Manage billing to change plans.",
};
const STATUS_LABEL: Record<string, string> = { none: "No subscription", trialing: "Trial", active: "Active", past_due: "Payment overdue", canceled: "Cancelled", unpaid: "Unpaid", incomplete: "Incomplete", incomplete_expired: "Expired", paused: "Paused" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ plan?: string; checkout?: string; error?: string }> }) {
  const sp = await searchParams;
  const { tenant } = await requireAccount();
  const plans = getPlans();
  const current = planById(plans, tenant.planId);
  const live = liveAccessAllowed(tenant);
  const prices = await Promise.all(plans.map(async (p) => [p.id, await priceFor(p.priceId)] as const));
  const price = (id: string) => prices.find(([i]) => i === id)?.[1];
  const canSubscribe = stripeConfigured() && plans.length > 0 && !tenant.billingExempt;

  return (
    <>
      <PageHeader title="Billing" description="Sandbox test keys are always free. A subscription unlocks live keys for the packs in your plan." />
      <div className="max-w-3xl space-y-4">
        {sp.checkout === "success" && !live && <Notice tone="success">Thanks. Your payment is being confirmed and your plan will activate within a minute. Refresh this page to check.</Notice>}
        {sp.checkout === "cancelled" && <Notice>Checkout was cancelled. You have not been charged.</Notice>}
        {sp.error && <Notice tone="error">{ERRORS[sp.error] ?? "Something went wrong."}</Notice>}
        {tenant.subscriptionStatus === "past_due" && <Notice tone="error">Your last payment did not go through. Live keys keep working while Stripe retries. Update your card in Manage billing to avoid losing access.</Notice>}

        <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {[
            ["Status", tenant.billingExempt ? "Provisioned by Briesa" : STATUS_LABEL[tenant.subscriptionStatus] ?? tenant.subscriptionStatus],
            ["Plan", tenant.billingExempt ? "Custom" : current?.name ?? "Sandbox"],
            ["Renews or ends", tenant.currentPeriodEnd ? formatDate(tenant.currentPeriodEnd) : "-"],
          ].map(([k, v]) => (<div key={k} className="bg-card p-5"><dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">{k}</dt><dd className="mt-2 text-lg tracking-tight">{v}</dd></div>))}
        </dl>

        {tenant.stripeCustomerId && stripeConfigured() && (
          <form action={openPortal}><Button type="submit" variant="outline">Manage billing</Button><span className="text-muted-foreground ml-3 text-xs">Update your card, download invoices, change or cancel your plan.</span></form>
        )}

        {!tenant.billingExempt && !(live && tenant.stripeCustomerId) && (
          <section className="pt-6">
            <h2 className="font-display text-lg">Plans</h2>
            {plans.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">Plans are not open for self-serve yet. <a className="text-foreground underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}?subject=Briesa%20API%20live%20access`}>Email us</a> and we will set you up.</p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {plans.map((p) => (
                  <div key={p.id} className={`rounded-xl border p-5 ${sp.plan === p.id ? "border-accent bg-accent-subtle" : "bg-card"}`}>
                    <div className="flex items-center justify-between"><h3 className="font-display text-base">{p.name}</h3>{sp.plan === p.id && <Badge variant="amber">Selected</Badge>}</div>
                    <p className="mt-2 text-2xl tracking-tighter">{price(p.id) ? formatPrice(price(p.id)!) : "Contact us"}</p>
                    {p.description && <p className="text-muted-foreground mt-2 text-sm">{p.description}</p>}
                    <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs"><Check className="text-success size-3.5" aria-hidden />{p.packs.includes("*") ? "Every pack" : p.packs.join(", ")}</p>
                    <form action={startCheckout} className="mt-4"><input type="hidden" name="plan" value={p.id} /><Button type="submit" variant="brand" className="w-full" disabled={!canSubscribe}>Subscribe</Button></form>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted-foreground mt-4 text-xs">You pay on Stripe&apos;s secure checkout page. Nothing is charged until you complete it.</p>
          </section>
        )}
      </div>
    </>
  );
}

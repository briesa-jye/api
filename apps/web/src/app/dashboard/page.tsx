import { liveAccessAllowed } from "@briesa/accounts/billing";
import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CodeBlock } from "@/components/site/CodePanel";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/account";
import { API_BASE_URL } from "@/lib/site";
import { getStore } from "@/lib/store";

const month = () => new Date().toISOString().slice(0, 7);

export default async function Overview() {
  const { tenant } = await requireAccount();
  const store = getStore();
  const [keys, usage] = await Promise.all([store.listApiKeys(tenant.id), store.usageSummary(tenant.id, month())]);
  const active = keys.filter((k) => !k.revokedAt);
  const total = (test: boolean) => usage.filter((u) => u.test === test).reduce((n, u) => n + u.count, 0);
  const live = liveAccessAllowed(tenant);

  const steps = [
    { done: active.some((k) => k.mode === "test"), label: "Create a test key", href: "/dashboard/keys" },
    { done: total(true) > 0, label: "Make your first test call", href: "/docs/quickstart" },
    { done: live, label: "Subscribe for live keys", href: "/dashboard/billing" },
  ];

  return (
    <>
      <PageHeader title="Overview" description="Your API at a glance." />

      <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        {[
          ["Access", tenant.billingExempt ? "Provisioned by Briesa" : live ? "Live access" : "Sandbox only"],
          ["Test calls this month", String(total(true))],
          ["Live calls this month", String(total(false))],
        ].map(([k, v]) => (
          <div key={k} className="bg-card p-5">
            <dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">{k}</dt>
            <dd className="mt-2 text-xl tracking-tight">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <h2 className="font-display text-lg">Getting started</h2>
        <ul className="mt-4 divide-y divide-dashed border-y border-dashed">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 py-4">
              <span className="flex items-center gap-3 text-sm">
                {s.done ? <Check className="text-success size-4" aria-label="Done" /> : <Circle className="text-muted-foreground size-4" aria-label="To do" />}
                <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
              </span>
              {!s.done && <Button asChild variant="outline" size="sm"><Link href={s.href}>Open</Link></Button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="font-display text-lg">Your API base URL</h2>
        <p className="text-muted-foreground mt-1 mb-4 text-sm">Send requests here with your key as a bearer token.</p>
        <CodeBlock code={`$ export BRIESA_URL=${API_BASE_URL}\n$ curl $BRIESA_URL/v1/packs \\\n  -H "Authorization: Bearer $BRIESA_KEY"`} />
      </section>
    </>
  );
}

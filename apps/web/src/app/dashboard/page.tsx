import { liveAccessAllowed } from "@briesa/accounts/billing";
import { Check, Circle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { DailyChart } from "@/components/charts/DailyChart";
import { OutcomeMix } from "@/components/charts/OutcomeMix";
import { OutcomePill } from "@/components/charts/OutcomePill";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Stat } from "@/components/dashboard/Stat";
import { CodeBlock } from "@/components/site/CodePanel";
import { Button } from "@/components/ui/button";
import { requireAccount } from "@/lib/account";
import { loadStats, pctChange } from "@/lib/analytics";
import { outcomeLevel } from "@/lib/outcomes";
import { API_BASE_URL } from "@/lib/site";
import { getStore } from "@/lib/store";

const DAYS = 30;
const ago = (d: Date) => {
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

export default async function Overview() {
  const { tenant } = await requireAccount();
  const store = getStore();
  const [keys, stats, recent] = await Promise.all([
    store.listApiKeys(tenant.id), loadStats(store, tenant.id, DAYS), store.listAudit(tenant.id, { limit: 8 }),
  ]);
  const active = keys.filter((k) => !k.revokedAt);
  const live = liveAccessAllowed(tenant);
  const done = [active.some((k) => k.mode === "test"), stats.total > 0, live];
  const steps = [
    { done: done[0], label: "Create a test key", href: "/dashboard/keys" },
    { done: done[1], label: "Make your first call or try the playground", href: "/dashboard/playground" },
    { done: done[2], label: "Subscribe for live keys", href: "/dashboard/billing" },
  ];
  const mix = stats.mix.map((r) => ({ ...r, outcomes: r.outcomes.map((o) => ({ ...o, ...outcomeLevel(r.packId, o.outcome) })) }));
  const rate = stats.escalationRate;
  const prevRate = stats.prevEscalationRate;

  return (
    <>
      <PageHeader title="Overview" description={`Your API over the last ${DAYS} days. ${tenant.billingExempt ? "Access provisioned by Briesa." : live ? "Live access is on." : "Sandbox only: subscribe to get live keys."}`}>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/playground">Open playground</Link></Button>
          <Button asChild variant="brand" size="sm"><Link href="/dashboard/keys">Create a key</Link></Button>
        </div>
      </PageHeader>

      <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Assessments" value={String(stats.total)} change={pctChange(stats.total, stats.prevTotal)} changeNote={`vs previous ${DAYS} days`} trend={stats.series.map((d) => d.live + d.test)} />
        <Stat label="Live calls" value={String(stats.live)} hint={stats.test ? `${stats.test} more in test mode` : "No test calls"} trend={stats.series.map((d) => d.live)} />
        <Stat label="Escalation rate" value={rate === null ? "-" : `${Math.round(rate * 100)}%`} change={rate !== null && prevRate ? pctChange(rate, prevRate) : null} changeNote="vs previous period" hint="Share of decisions that recommend a person review" />
        <Stat label="Packs in use" value={String(stats.mix.length)} hint={`${active.length} active key${active.length === 1 ? "" : "s"}`} />
      </dl>

      <section className="bg-card mt-6 rounded-xl border p-5"><DailyChart data={stats.series} title={`Assessments per day, last ${DAYS} days`} /></section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="bg-card rounded-xl border p-5"><OutcomeMix rows={mix} title="What your packs decided" /></section>
        <section className="bg-card rounded-xl border p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-base">Recent decisions</h3><Link href="/dashboard/audit" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">All records <ArrowRight className="size-3" aria-hidden /></Link></div>
          {recent.length === 0 ? <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">Nothing yet. Run an assessment and it appears here with its full audit record.</p> : (
            <ul className="divide-y divide-dashed">
              {recent.map((r) => {
                const outcome = (r.output as { outcome?: string } | null)?.outcome ?? null;
                return (
                  <li key={r.requestId}>
                    <Link href={`/dashboard/audit/${r.requestId}`} className="hover:bg-muted/30 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5">
                      <span className="min-w-0"><span className="block truncate font-mono text-xs">{r.packId ?? "-"}</span><span className="text-muted-foreground text-xs">{r.test ? "test" : "live"} · {ago(r.createdAt)}{r.reference ? ` · ${r.reference}` : ""}</span></span>
                      <OutcomePill outcome={outcome} {...outcomeLevel(r.packId, outcome)} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {!done.every(Boolean) && (
        <section className="mt-6 rounded-xl border p-5">
          <h3 className="font-display text-base">Getting started</h3>
          <ul className="mt-3 divide-y divide-dashed border-y border-dashed">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-4 py-3">
                <span className="flex items-center gap-3 text-sm">
                  {s.done ? <Check className="text-success size-4" aria-label="Done" /> : <Circle className="text-muted-foreground size-4" aria-label="To do" />}
                  <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                </span>
                {!s.done && <Button asChild variant="outline" size="sm"><Link href={s.href}>Open</Link></Button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 max-w-3xl">
        <h3 className="font-display text-base">Your API base URL</h3>
        <p className="text-muted-foreground mt-1 mb-3 text-sm">Send requests here with your key as a bearer token.</p>
        <CodeBlock code={`$ export BRIESA_URL=${API_BASE_URL}\n$ curl $BRIESA_URL/v1/packs \\\n  -H "Authorization: Bearer $BRIESA_KEY"`} />
      </section>
    </>
  );
}

import { ArrowRight, ClipboardCheck, History, Flag, ScanSearch } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "@/components/site/CodePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listPacks } from "@/lib/packs";
import { API_BASE_URL } from "@/lib/site";

const REQUEST = `$ curl ${API_BASE_URL}/v1/assess \\
  -H "Authorization: Bearer $BRIESA_KEY" \\
  -d '{
    "pack": "whs-incident-notification",
    "scenario_type": "classify_incident",
    "jurisdiction": "NSW",
    "inputs": { "incident_type": "death", "arose_from_work": true }
  }'`;

// Real output from the running API for the request above, trimmed to the fields discussed on this page.
const RESPONSE = `{
  "outcome": "notifiable",
  "escalation_recommended": true,
  "reasons": [{
    "rule_id": "notifiable-incident",
    "rule_version": "1.0.0",
    "source": {
      "instrument": "Model WHS Act Part 3",
      "url": "https://www.safeworkaustralia.gov.au/..."
    },
    "effective_from": "2020-01-01"
  }],
  "pack": {
    "id": "whs-incident-notification",
    "version": "0.1.0",
    "status": "draft"
  },
  "human_review_recommended": true
}`;

const WORKING = [
  { icon: ScanSearch, title: "Reasons with sources", body: "Each reason names the rule, its version, the instrument and section, and the date it took effect." },
  { icon: Flag, title: "Pack status on every response", body: "Draft, beta or verified, so you know how much weight a result can carry." },
  { icon: ClipboardCheck, title: "A review flag you can act on", body: "human_review_recommended is true for any pack short of verified, and for any escalation." },
  { icon: History, title: "An audit record per call", body: "Stored with a hash of the inputs, never the inputs themselves, plus the pack and rule versions used." },
] as const;

export default function HomePage() {
  const packs = listPacks();
  const real = packs.filter((p) => !p.empty);
  const scaffolds = packs.filter((p) => p.empty);

  return (
    <>
      <section className="hero-padding relative overflow-hidden">
        <div aria-hidden className="grid-bg" />
        <div aria-hidden className="glow -top-40 right-0 h-[32rem] w-[44rem] md:right-20" />
        <div className="relative z-10 container grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <h1 className="text-4xl leading-none tracking-tighter md:text-5xl lg:text-6xl">
              Compliance decisions your software can explain.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-xl text-base leading-relaxed md:text-lg">
              Australian compliance rules behind one API. Every result cites its rule, source and effective date for a person to review.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="brand" size="lg"><Link href="/signup">Get a test key</Link></Button>
              <Button asChild variant="outline" size="lg"><Link href="/docs">Read the docs</Link></Button>
            </div>
          </div>
          <div className="grid gap-3">
            <CodeBlock label="Request" code={REQUEST} />
            <CodeBlock label="Response, trimmed" code={RESPONSE} />
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-20">
          <div>
            <h2 className="text-3xl tracking-tighter md:text-4xl">Every result shows its working.</h2>
            <p className="text-muted-foreground mt-4 max-w-md leading-relaxed">
              Rules are data, versioned with effective dates and cited to the regulator&apos;s own guidance. Nothing is a black box.
            </p>
          </div>
          <ul className="divide-y divide-dashed border-y border-dashed">
            {WORKING.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4 py-6">
                <Icon className="text-accent mt-0.5 size-5 shrink-0" aria-hidden />
                <div>
                  <h3 className="font-display text-base">{title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-padding border-t border-dashed">
        <div className="container">
          <h2 className="max-w-2xl text-3xl tracking-tighter md:text-4xl">One pack per industry. Adding one never changes the platform.</h2>
          <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
            A pack is a versioned bundle of rules, obligations and test scenarios. Both live packs are drafts and say so on every response.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            {real.map((p, i) => (
              <Link
                key={p.id}
                href={`/packs/${p.id}`}
                className={`group relative flex min-h-64 flex-col justify-between overflow-hidden rounded-xl border p-6 no-underline transition-colors hover:border-accent/60 ${i === 0 ? "md:col-span-4 bg-accent-subtle" : "md:col-span-2 bg-card"}`}
              >
                {i === 1 && <div aria-hidden className="dots absolute inset-0 opacity-60" />}
                <div className="relative flex items-start justify-between gap-4">
                  <Badge variant={i === 0 ? "amber" : "outline"}>{p.status}</Badge>
                  <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
                <div className="relative mt-10">
                  <h3 className="font-display text-xl tracking-tight md:text-2xl">{p.name}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {p.ruleCount} sourced rules, {p.obligationCount} obligations. {p.regulators.slice(0, 3).join(", ")}{p.regulators.length > 3 ? " and more" : ""}.
                  </p>
                </div>
              </Link>
            ))}
            {scaffolds.map((p) => (
              <div key={p.id} className="flex min-h-40 flex-col justify-between rounded-xl border border-dashed p-5 md:col-span-2">
                <Badge variant="outline" className="w-fit">Scaffold</Badge>
                <div>
                  <h3 className="font-display text-base tracking-tight">{p.industry.replace(/-/g, " ")}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">No rules yet. Created to show how a new industry is added.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding border-t border-dashed">
        <div className="container">
          <h2 className="text-3xl tracking-tighter md:text-4xl">Rules decide. AI only annotates.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="bg-card rounded-xl border p-7">
              <h3 className="font-display text-lg">Deterministic rules</h3>
              <ul className="text-muted-foreground mt-4 space-y-3 text-sm leading-relaxed">
                <li>Obligations, thresholds and required steps come from versioned data, not prompts.</li>
                <li>The same inputs always return the same answer.</li>
                <li>Rules that are not yet verified are never applied to an outcome. They are listed as pending.</li>
              </ul>
            </div>
            <div className="bg-accent-subtle rounded-xl border p-7">
              <h3 className="font-display text-lg">Optional AI notes</h3>
              <ul className="text-muted-foreground mt-4 space-y-3 text-sm leading-relaxed">
                <li>Off unless you ask for them on a request, and clearly labelled when present.</li>
                <li>Only booleans, numbers and fixed options reach the model. Free text and personal details never do.</li>
                <li>Notes never change the outcome, and never say whether to lodge a report or notify a regulator.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding border-t border-dashed">
        <div className="container">
          <h2 className="text-3xl tracking-tighter md:text-4xl">Try it in a minute.</h2>
          <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
            Test keys run the same logic as live keys, are not billed, and need no card.
          </p>
          <div className="mt-8 max-w-3xl">
            <CodeBlock label="List the packs available to your key" code={`$ curl ${API_BASE_URL}/v1/packs \\\n  -H "Authorization: Bearer $BRIESA_KEY"`} />
          </div>
          <dl className="mt-10 grid divide-y divide-dashed border-y border-dashed md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              ["Idempotent by design", "Send an Idempotency-Key on any POST. Replays return the original response and are not billed twice."],
              ["Signed webhooks", "Learn when rules or packs change. HMAC signatures, retries with backoff, and a delivery log."],
              ["Versioned and documented", "An OpenAPI 3.1 spec, a /v1 prefix and a 12 month deprecation policy."],
            ].map(([t, b]) => (
              <div key={t} className="py-6 md:px-6 md:first:pl-0 md:last:pr-0">
                <dt className="font-display text-base">{t}</dt>
                <dd className="text-muted-foreground mt-1 text-sm leading-relaxed">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-padding relative overflow-hidden border-t border-dashed">
        <div aria-hidden className="glow -bottom-52 left-1/3 h-[28rem] w-[40rem]" />
        <div className="relative z-10 container">
          <h2 className="max-w-2xl text-4xl leading-none tracking-tighter md:text-5xl">Start with a free test key.</h2>
          <p className="text-muted-foreground mt-5 max-w-xl leading-relaxed">
            Sandbox access to every pack. Subscribe when you are ready for live keys.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="brand" size="lg"><Link href="/signup">Get a test key</Link></Button>
            <Button asChild variant="outline" size="lg"><Link href="/pricing">See pricing</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}

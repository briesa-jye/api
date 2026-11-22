import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPack, listPacks } from "@/lib/packs";

export const dynamicParams = false;
export const generateStaticParams = () => listPacks().map((p) => ({ id: p.id }));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = getPack((await params).id);
  return p ? { title: p.name } : {};
}

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const p = getPack((await params).id);
  if (!p) notFound();
  return (
    <div className="container py-12 md:py-16">
      <Link href="/packs" className="text-muted-foreground hover:text-foreground text-sm no-underline">All packs</Link>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl tracking-tighter md:text-5xl">{p.name}</h1>
        <Badge variant="amber">{p.empty ? "scaffold" : p.status}</Badge>
      </div>
      <p className="text-muted-foreground mt-4 max-w-2xl leading-relaxed">
        {p.status === "verified"
          ? "Verified against its sources by a named reviewer."
          : "This pack is not verified. It was compiled from regulator guidance and has not been reviewed by a qualified person, so treat its results as decision support to check, not to rely on."}
      </p>

      <dl className="mt-10 grid gap-6 border-y border-dashed py-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Version", p.version],
          ["Regulators", p.regulators.join(", ") || "None yet"],
          ["Jurisdictions", p.jurisdictions.join(", ")],
          ["Content", p.empty ? "No rules yet" : `${p.ruleCount} sourced rules, ${p.obligationCount} obligations`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">{k}</dt>
            <dd className="mt-1 text-sm">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-2xl tracking-tighter">Scenario types</h2>
      <ul className="mt-4 divide-y divide-dashed border-y border-dashed">
        {p.scenarioTypes.map((s) => (
          <li key={s.id} className="py-5">
            <p className="font-mono text-sm">{s.id}</p>
            <p className="text-muted-foreground mt-1 text-sm">{s.description}</p>
            <p className="text-muted-foreground mt-3 text-xs">
              Outcomes, lowest to highest: <span className="text-foreground font-mono">{s.outcomes.join(", ")}</span>
            </p>
          </li>
        ))}
      </ul>

      {p.needsReviewCount > 0 && (
        <p className="text-muted-foreground mt-8 max-w-2xl text-sm leading-relaxed">
          {p.needsReviewCount} item{p.needsReviewCount === 1 ? "" : "s"} in this pack are marked needs review. They are never applied to an outcome; when one matches, the response lists it as pending and recommends human review.
        </p>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild variant="brand" size="lg"><Link href="/signup">Get a test key</Link></Button>
        <Button asChild variant="outline" size="lg"><Link href="/docs/quickstart">Read the quickstart</Link></Button>
      </div>
    </div>
  );
}

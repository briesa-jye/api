import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listPacks } from "@/lib/packs";

export const metadata: Metadata = { title: "Packs", description: "The industry packs available through the API, with their maturity status." };

export default function PacksPage() {
  const packs = listPacks();
  return (
    <div className="container py-12 md:py-16">
      <h1 className="text-4xl tracking-tighter md:text-5xl">Packs</h1>
      <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
        Only a verified pack is presented as production-ready. Every API response carries the pack&apos;s status so your users can see how much to rely on it.
      </p>
      <ul className="mt-10 divide-y divide-dashed border-y border-dashed">
        {packs.map((p) => (
          <li key={p.id}>
            <Link href={`/packs/${p.id}`} className="hover:bg-muted/40 grid gap-3 px-1 py-6 no-underline transition-colors md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl tracking-tight">{p.name}</h2>
                  <Badge variant={p.empty ? "outline" : "amber"}>{p.empty ? "scaffold" : p.status}</Badge>
                </div>
                <p className="text-muted-foreground mt-2 text-sm">
                  {p.empty
                    ? "No rules yet. Created to show how a new industry is added."
                    : `${p.ruleCount} sourced rules and ${p.obligationCount} obligations. ${p.regulators.join(", ")}.`}
                </p>
              </div>
              <span className="text-muted-foreground font-mono text-xs">v{p.version}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

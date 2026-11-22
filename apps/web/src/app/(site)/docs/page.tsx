import type { Metadata } from "next";
import Link from "next/link";
import { DOCS } from "@/lib/docs";

export const metadata: Metadata = { title: "Docs", description: "Quickstart, API reference, versioning policy and pack authoring guide." };

export default function DocsIndex() {
  return (
    <>
      <h1 className="text-4xl tracking-tighter md:text-5xl">Documentation</h1>
      <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">Everything you need to call the API, and to understand what it returns.</p>
      <ul className="mt-10 divide-y divide-dashed border-y border-dashed">
        {DOCS.map((d) => (
          <li key={d.slug}>
            <Link href={`/docs/${d.slug}`} className="hover:bg-muted/40 flex flex-col gap-1 px-1 py-5 no-underline transition-colors">
              <span className="font-display text-lg">{d.title}</span>
              <span className="text-muted-foreground text-sm">{d.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

import Link from "next/link";
import { DOCS } from "@/lib/docs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container grid gap-10 py-12 md:grid-cols-[14rem_1fr] md:py-16">
      <aside>
        <nav aria-label="Docs" className="sticky top-24 flex flex-col gap-1">
          <span className="text-muted-foreground mb-2 font-mono text-[0.625rem] tracking-wider uppercase">Documentation</span>
          {DOCS.map((d) => (
            <Link key={d.slug} href={`/docs/${d.slug}`} className="text-muted-foreground hover:text-foreground rounded-md py-1.5 text-sm no-underline transition-colors">{d.title}</Link>
          ))}
          <Link href="/docs/openapi.json" className="text-muted-foreground hover:text-foreground py-1.5 text-sm no-underline transition-colors">OpenAPI 3.1 (JSON)</Link>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

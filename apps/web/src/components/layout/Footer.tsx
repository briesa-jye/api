import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { MAIN_SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

const COLUMNS = [
  { title: "Product", links: [{ label: "Packs", href: "/packs" }, { label: "Pricing", href: "/pricing" }, { label: "Sign in", href: "/login" }] },
  { title: "Developers", links: [{ label: "Quickstart", href: "/docs/quickstart" }, { label: "API reference", href: "/docs/reference" }, { label: "Versioning", href: "/docs/versioning" }, { label: "Authoring packs", href: "/docs/pack-authoring" }] },
  { title: "Briesa", links: [{ label: "briesa.com", href: MAIN_SITE_URL }, { label: "Privacy", href: `${MAIN_SITE_URL}/privacy` }, { label: "Terms", href: `${MAIN_SITE_URL}/terms` }, { label: "Contact", href: `mailto:${SUPPORT_EMAIL}` }] },
] as const;

export default function Footer() {
  return (
    <footer className="container pb-12">
      <div className="border-t border-dashed pt-10">
        <div className="grid gap-12 md:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo />
            <p className="text-muted-foreground mt-3 max-w-xs text-sm leading-relaxed">
              Decision support, not legal advice. A qualified person reviews every result and makes the compliance decision.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((c) => (
              <div key={c.title}>
                <span className="text-muted-foreground mb-3 block font-mono text-[0.625rem] tracking-wider uppercase">{c.title}</span>
                <div className="flex flex-col gap-2.5">
                  {c.links.map((l) => (
                    <Link key={l.label} href={l.href} className="text-foreground hover:text-accent-hover text-sm no-underline transition-colors">{l.label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground mt-10 text-xs">Designed and built in Australia.</p>
      </div>
    </footer>
  );
}

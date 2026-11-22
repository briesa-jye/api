"use client";

import { List, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Packs", href: "/packs" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
] as const;

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cn("text-sm no-underline transition-colors", active(l.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost"><Link href="/login">Sign in</Link></Button>
          <Button asChild variant="brand"><Link href="/signup">Get a test key</Link></Button>
        </div>
        <button type="button" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)} className="text-foreground -mr-2 p-2 md:hidden">
          {open ? <X className="size-5" /> : <List className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="bg-background border-t md:hidden">
          <div className="container flex flex-col py-4">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-dashed py-4 text-lg no-underline">{l.label}</Link>
            ))}
            <div className="mt-5 flex gap-3">
              <Button asChild variant="outline" size="lg" className="flex-1"><Link href="/login" onClick={() => setOpen(false)}>Sign in</Link></Button>
              <Button asChild variant="brand" size="lg" className="flex-1"><Link href="/signup" onClick={() => setOpen(false)}>Get a test key</Link></Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

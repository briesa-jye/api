"use client";

import { BarChart3, CreditCard, FlaskConical, KeyRound, LayoutDashboard, ScrollText, Webhook } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Playground", href: "/dashboard/playground", icon: FlaskConical },
  { label: "API keys", href: "/dashboard/keys", icon: KeyRound },
  { label: "Webhooks", href: "/dashboard/webhooks", icon: Webhook },
  { label: "Usage", href: "/dashboard/usage", icon: BarChart3 },
  { label: "Audit", href: "/dashboard/audit", icon: ScrollText },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map(({ label, href, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline transition-colors", active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
            <Icon className="size-4" aria-hidden />{label}
          </Link>
        );
      })}
    </nav>
  );
}

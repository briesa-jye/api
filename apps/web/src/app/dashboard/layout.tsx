import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/layout/Logo";
import { SidebarNav } from "@/components/dashboard/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(auth)/actions";
import { requireAccount } from "@/lib/account";
import { liveAccessAllowed } from "@briesa/accounts/billing";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
// Per-user data and session cookies: never prerender or cache any dashboard page.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = await requireAccount();
  const live = liveAccessAllowed(tenant);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="bg-card/40 flex flex-col gap-6 border-b p-4 md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0 md:p-5">
        <div className="flex items-center justify-between md:block"><Logo href="/dashboard" /></div>
        <SidebarNav />
        <div className="mt-auto hidden space-y-3 md:block">
          <Badge variant={live ? "amber" : "outline"}>{tenant.billingExempt ? "Provisioned" : live ? "Live access" : "Sandbox"}</Badge>
          <p className="text-muted-foreground truncate text-xs" title={user.email}>{user.email}</p>
          <form action={signOut}><Button variant="ghost" size="sm" type="submit" className="-ml-2"><LogOut className="size-3.5" aria-hidden />Sign out</Button></form>
        </div>
      </aside>
      <div className="min-w-0 p-5 md:p-10">{children}</div>
    </div>
  );
}

import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { requireAccount } from "@/lib/account";

export const metadata: Metadata = {
  title: "Quick check", robots: { index: false },
  appleWebApp: { capable: true, title: "Quick check", statusBarStyle: "black-translucent" },
};
// Per-user data and session cookies: never prerender or cache.
export const dynamic = "force-dynamic";

export default async function CheckLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAccount();
  return (
    <div className="min-h-dvh">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-3">
          <Logo href="/check" />
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground hidden truncate text-xs sm:block" title={user.email}>{user.email}</span>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs no-underline"><LayoutDashboard className="size-3.5" aria-hidden />Dashboard</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8">{children}</main>
    </div>
  );
}

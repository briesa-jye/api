import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="grid-bg" />
      <div aria-hidden className="glow -top-48 left-1/2 h-[28rem] w-[40rem] -translate-x-1/2" />
      <header className="relative z-10 container flex h-16 items-center justify-between">
        <Logo />
        <Link href="/docs" className="text-muted-foreground hover:text-foreground text-sm no-underline">Docs</Link>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-5 pb-16">{children}</main>
    </div>
  );
}

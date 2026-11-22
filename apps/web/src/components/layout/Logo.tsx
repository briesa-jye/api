import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} aria-label="Briesa API home" className={cn("text-foreground flex items-center gap-2 no-underline", className)}>
      <span className="relative block aspect-[481/512] h-5 shrink-0">
        <Image src="/images/logos/icon-light-512-isolated.svg" alt="" aria-hidden fill />
      </span>
      <span className="font-display text-base font-semibold tracking-tight">Briesa</span>
      <span className="text-muted-foreground font-mono text-xs tracking-wide">API</span>
    </Link>
  );
}

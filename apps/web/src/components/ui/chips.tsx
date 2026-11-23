"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Toggle chips for picking any number of options. Each chip is a button with aria-pressed, so it works by keyboard and screen reader. */
export function Chips({ options, value, onChange, "aria-label": ariaLabel }: {
  options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; "aria-label": string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95",
              on ? "border-accent bg-accent/15 text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground")}>
            {on && <Check className="size-3" aria-hidden />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

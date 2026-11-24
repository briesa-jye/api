"use client";

import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

/** A row of mutually exclusive choices (Yes / No / Unknown). Clicking the chosen one again clears it. Arrow keys move between options. */
export function Segmented({ value, onValueChange, options, "aria-label": ariaLabel, className }: {
  value: string; onValueChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; "aria-label": string; className?: string;
}) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={onValueChange} aria-label={ariaLabel} className={cn("bg-input/30 border-input inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border p-0.5", className)}>
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} disabled={o.disabled}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground rounded-[0.6rem] px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 data-[state=on]:shadow-sm disabled:pointer-events-none disabled:opacity-40">
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

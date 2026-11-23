"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as S } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface MenuOption { value: string; label: string; hint?: string }

const EMPTY = "__empty__"; // Radix items cannot have an empty value, so "no selection" is mapped through this sentinel.

/**
 * A themed dropdown that replaces the browser's native <select>. Keyboard and screen-reader support come from Radix
 * (arrow keys, type-ahead, Escape). With `name` it still submits with a plain <form>, so GET filter forms keep working.
 */
export function SelectMenu({ id, name, value, defaultValue, onValueChange, options, placeholder = "Choose...", emptyLabel, disabled, className, "aria-label": ariaLabel }: {
  id?: string; name?: string; value?: string; defaultValue?: string; onValueChange?: (v: string) => void;
  options: MenuOption[]; placeholder?: string; /** Adds a first option that clears the choice. */ emptyLabel?: string;
  disabled?: boolean; className?: string; "aria-label"?: string;
}) {
  // Always controlled inside, so a plain <form> gets the real value (empty string for "no selection"), never the internal sentinel.
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const toRadix = (v: string) => (v === "" ? (emptyLabel ? EMPTY : "") : v);
  return (
    <S.Root disabled={disabled} value={toRadix(current)} onValueChange={(v) => { const real = v === EMPTY ? "" : v; setInner(real); onValueChange?.(real); }}>
      {name && <input type="hidden" name={name} value={current} />}
      <S.Trigger id={id} aria-label={ariaLabel} className={cn(
        "bg-input/30 border-input data-[placeholder]:text-muted-foreground hover:bg-input/50 flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:border-ring", className)}>
        <span className="truncate"><S.Value placeholder={placeholder}>{options.find((o) => o.value === current)?.label}</S.Value></span>
        <S.Icon asChild><ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180" aria-hidden /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} collisionPadding={12}
          className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-50 max-h-80 w-(--radix-select-trigger-width) min-w-40 overflow-hidden rounded-xl border p-1 shadow-xl">
          <S.Viewport className="max-h-72 overflow-y-auto">
            {emptyLabel && <Item value={EMPTY} label={emptyLabel} muted />}
            {options.map((o) => <Item key={o.value} value={o.value} label={o.label} hint={o.hint} />)}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

function Item({ value, label, hint, muted }: { value: string; label: string; hint?: string; muted?: boolean }) {
  return (
    <S.Item value={value} className="data-[highlighted]:bg-muted data-[state=checked]:text-foreground flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm outline-none select-none">
      <span className="min-w-0">
        <S.ItemText><span className={muted ? "text-muted-foreground" : ""}>{label}</span></S.ItemText>
        {hint && <span className="text-muted-foreground block truncate text-xs">{hint}</span>}
      </span>
      <S.ItemIndicator><Check className="text-accent-hover size-4" aria-hidden /></S.ItemIndicator>
    </S.Item>
  );
}

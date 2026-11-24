"use client";

import { Chips } from "@/components/ui/chips";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import type { Field } from "@/lib/schema-fields";
import { humanize } from "@/lib/text";

/** The right control for a question: yes/no and short lists as toggles, long lists as a dropdown, multi-choice as chips. */
export function Control({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const id = `f-${f.path}`;
  if (f.kind === "boolean") return <Segmented aria-label={f.label} value={value} onValueChange={onChange} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />;
  if (f.kind === "multi") return <Chips aria-label={f.label} options={f.options!.map((o) => ({ value: o, label: humanize(o) }))} value={value.split(",").filter(Boolean)} onChange={(v) => onChange(v.join(","))} />;
  if (f.kind === "enum") {
    const opts = f.options!.map((o) => ({ value: o, label: humanize(o) }));
    return f.options!.length <= 4
      ? <Segmented aria-label={f.label} value={value} onValueChange={onChange} options={opts} />
      : <SelectMenu id={id} value={value} onValueChange={onChange} options={opts} placeholder="Choose..." emptyLabel={f.required ? undefined : "Not provided"} />;
  }
  return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} type={f.kind === "string" ? "text" : "number"} min={f.min} step={f.kind === "integer" ? 1 : "any"} />;
}

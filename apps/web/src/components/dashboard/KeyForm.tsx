"use client";

import { useActionState } from "react";
import { createKeyAction, type SecretResult } from "@/app/dashboard/actions";
import { OneTimeSecret } from "@/components/dashboard/OneTimeSecret";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/input";

const SCOPES = [
  { id: "assess", label: "assess", hint: "Run assessments", def: true },
  { id: "read", label: "read", hint: "List packs, rules, obligations, usage", def: true },
  { id: "audit:read", label: "audit:read", hint: "Read audit records", def: true },
  { id: "webhooks", label: "webhooks", hint: "Manage webhooks via the API", def: false },
  { id: "keys:manage", label: "keys:manage", hint: "Create and revoke keys via the API", def: false },
];

export function KeyForm({ packs, canLive }: { packs: { id: string; name: string }[]; canLive: boolean }) {
  const [state, action, pending] = useActionState<SecretResult, FormData>(createKeyAction, null);
  return (
    <form action={action} className="bg-card space-y-6 rounded-xl border p-6">
      <h2 className="font-display text-lg">Create a key</h2>
      {state?.ok === false && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && <OneTimeSecret secret={state.secret} label={state.label} kind="API key" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="key-name">Name</Label>
          <Input id="key-name" name="name" placeholder="Production backend" maxLength={100} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="key-mode">Type</Label>
          <select id="key-mode" name="mode" defaultValue="test" className="bg-input/30 border-input h-10 w-full rounded-lg border px-3 text-sm">
            <option value="test">Test (free sandbox)</option>
            <option value="live" disabled={!canLive}>Live{canLive ? "" : " (needs a subscription)"}</option>
          </select>
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Permissions</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SCOPES.map((s) => (
            <label key={s.id} className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="scopes" value={s.id} defaultChecked={s.def} className="accent-accent mt-1" />
              <span><span className="font-mono text-xs">{s.label}</span><span className="text-muted-foreground block text-xs">{s.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Packs</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="packs" value="*" defaultChecked className="accent-accent" />All packs</label>
          {packs.map((p) => (
            <label key={p.id} className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="packs" value={p.id} className="accent-accent" /><span className="truncate">{p.name}</span></label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">Live keys are limited to the packs in your plan.</p>
      </fieldset>
      <Button type="submit" variant="brand" disabled={pending}>{pending ? "Creating..." : "Create key"}</Button>
    </form>
  );
}

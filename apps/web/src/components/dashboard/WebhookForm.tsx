"use client";

import { useActionState } from "react";
import { createWebhookAction, type SecretResult } from "@/app/dashboard/actions";
import { OneTimeSecret } from "@/components/dashboard/OneTimeSecret";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/input";

const EVENTS = [
  { id: "assessment.completed", hint: "After each assessment, with the outcome only" },
  { id: "rules.updated", hint: "When rules in a pack you use change" },
  { id: "pack.updated", hint: "When a pack is added, removed, or its version or status changes" },
];

export function WebhookForm({ packs }: { packs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SecretResult, FormData>(createWebhookAction, null);
  return (
    <form action={action} className="bg-card space-y-6 rounded-xl border p-6">
      <h2 className="font-display text-lg">Add an endpoint</h2>
      {state?.ok === false && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && <OneTimeSecret secret={state.secret} label={state.label} kind="signing secret" />}
      <div className="space-y-2">
        <Label htmlFor="wh-url">Endpoint URL</Label>
        <Input id="wh-url" name="url" type="url" placeholder="https://your-app.example/briesa-webhook" required />
        <p className="text-muted-foreground text-xs">Must be https and publicly reachable. Redirects are not followed.</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Events</legend>
        {EVENTS.map((e) => (
          <label key={e.id} className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="events" value={e.id} defaultChecked={e.id !== "assessment.completed"} className="accent-accent mt-1" />
            <span><span className="font-mono text-xs">{e.id}</span><span className="text-muted-foreground block text-xs">{e.hint}</span></span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Packs</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="packs" value="*" defaultChecked className="accent-accent" />All my packs</label>
          {packs.map((p) => (
            <label key={p.id} className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="packs" value={p.id} className="accent-accent" /><span className="truncate">{p.name}</span></label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="brand" disabled={pending}>{pending ? "Adding..." : "Add endpoint"}</Button>
    </form>
  );
}

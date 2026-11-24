"use client";

import { useActionState, useState } from "react";
import { createKeyAction, type SecretResult } from "@/app/dashboard/actions";
import { OneTimeSecret } from "@/components/dashboard/OneTimeSecret";
import { Button } from "@/components/ui/button";
import { Chips } from "@/components/ui/chips";
import { Input, Label, Notice } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";

const SCOPES = [
  { id: "assess", label: "assess", hint: "Run assessments", def: true },
  { id: "read", label: "read", hint: "List packs, rules, obligations, usage", def: true },
  { id: "audit:read", label: "audit:read", hint: "Read audit records", def: true },
  { id: "webhooks", label: "webhooks", hint: "Manage webhooks via the API", def: false },
  { id: "keys:manage", label: "keys:manage", hint: "Create and revoke keys via the API", def: false },
];

export function KeyForm({ packs, widgetPacks, canLive }: { packs: { id: string; name: string }[]; widgetPacks: { id: string; name: string }[]; canLive: boolean }) {
  const [state, action, pending] = useActionState<SecretResult, FormData>(createKeyAction, null);
  const [kind, setKind] = useState<"secret" | "publishable">("secret");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [chosen, setChosen] = useState<string[]>([]);
  const widget = kind === "publishable";

  return (
    <form action={action} className="bg-card space-y-6 rounded-xl border p-6">
      <h2 className="font-display text-lg">Create a key</h2>
      {state?.ok === false && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && <OneTimeSecret secret={state.secret} label={state.label} kind="API key" publishable={state.publishable} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="mode" value={mode} />

      <div className="space-y-2">
        <Label>What is it for?</Label>
        <Segmented aria-label="Key kind" value={kind} onValueChange={(v) => v && setKind(v as typeof kind)}
          options={[{ value: "secret", label: "Your server (secret key)" }, { value: "publishable", label: "A web page or widget (publishable key)" }]} />
        <p className="text-muted-foreground text-xs leading-relaxed">
          {widget
            ? "A publishable key is safe to put in a web page. It only works from the sites you list, can only run assessments and read the questions for the packs you choose, and has a monthly limit."
            : "A secret key can do everything you allow. Keep it on your server, never in a web page, an app or a public repository. Requests from a browser are refused."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="key-name">Name</Label>
          <Input id="key-name" name="name" placeholder={widget ? "Marketing site widget" : "Production backend"} maxLength={100} required />
        </div>
        <div className="space-y-2">
          <Label>Mode</Label>
          <Segmented aria-label="Mode" value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}
            options={[{ value: "test", label: "Test (free)" }, { value: "live", label: canLive ? "Live" : "Live (needs a subscription)", disabled: !canLive }]} />
        </div>
      </div>

      {widget ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="key-origins">Allowed sites</Label>
            <textarea id="key-origins" name="origins" rows={3} required placeholder={"https://www.example.com\nhttps://*.example.com"}
              className="bg-input/30 border-input focus-visible:ring-ring/40 w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus-visible:ring-3" />
            <p className="text-muted-foreground text-xs leading-relaxed">One per line. Use the exact address people see, starting with https://. A <span className="font-mono">*.</span> covers subdomains such as <span className="font-mono">https://*.example.com</span>. {mode === "test" && <>For local development in test mode you can also use <span className="font-mono">http://localhost:3000</span>.</>}</p>
          </div>
          <div className="space-y-2">
            <Label>Packs the widget can use</Label>
            <Chips aria-label="Packs" options={widgetPacks.map((p) => ({ value: p.id, label: p.name }))} value={chosen} onChange={setChosen} />
            {chosen.map((id) => <input key={id} type="hidden" name="packs" value={id} />)}
            <p className="text-muted-foreground text-xs">Choose at least one. A publishable key never gets all packs.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="key-cap">Calls per month</Label>
            <Input id="key-cap" name="cap" type="number" min={1} placeholder={mode === "live" ? "5000" : "500"} className="w-40" />
            <p className="text-muted-foreground text-xs">Calls stop at this limit, so a copied key cannot run up a bill. Leave empty for the default ({mode === "live" ? "5,000" : "500"}). Each visitor is also limited to a few calls a minute.</p>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
      <Button type="submit" variant="brand" disabled={pending}>{pending ? "Creating..." : widget ? "Create publishable key" : "Create key"}</Button>
    </form>
  );
}

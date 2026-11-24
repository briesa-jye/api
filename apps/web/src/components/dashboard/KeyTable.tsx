"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { revokeKeyAction, rotateKeyAction, updateKeyAction, type SecretResult, type UpdateResult } from "@/app/dashboard/actions";
import { OneTimeSecret } from "@/components/dashboard/OneTimeSecret";
import { Td, Th } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/input";

export interface KeyRow {
  id: string; name: string; prefix: string; mode: "test" | "live"; scopes: string[]; created: string; revoked: boolean;
  kind: "secret" | "publishable"; publicKey: string | null; allowedOrigins: string[]; monthlyCap: number | null; used: number;
}

export function KeyTable({ keys }: { keys: KeyRow[] }) {
  // Rotate returns the replacement key, shown once above the table.
  const [state, rotate] = useActionState<SecretResult, FormData>(rotateKeyAction, null);
  return (
    <div className="space-y-4">
      {state?.ok && <OneTimeSecret secret={state.secret} label={state.label} kind="API key" publishable={state.publishable} />}
      {state?.ok === false && <Notice tone="error">{state.error}</Notice>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[48rem]">
          <thead className="bg-muted/30 border-b"><tr><Th>Name</Th><Th>Key</Th><Th>Type</Th><Th>Access</Th><Th>Created</Th><Th /></tr></thead>
          <tbody className="divide-y divide-dashed">
            {keys.length === 0 && <tr><Td className="text-muted-foreground py-8 text-center">No keys yet. Create your first test key below.</Td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className={k.revoked ? "opacity-50" : ""}>
                <Td>{k.name}{k.revoked && <Badge variant="outline" className="ml-2">revoked</Badge>}</Td>
                <Td>{k.kind === "publishable" && k.publicKey && !k.revoked ? <CopyKey value={k.publicKey} /> : <span className="font-mono text-xs">{k.kind === "publishable" ? "pk" : "bk"}_{k.mode}_{k.prefix}...</span>}</Td>
                <Td className="space-x-1 whitespace-nowrap"><Badge variant={k.mode === "live" ? "amber" : "outline"}>{k.mode}</Badge><Badge variant={k.kind === "publishable" ? "subtle" : "outline"}>{k.kind === "publishable" ? "publishable" : "secret"}</Badge></Td>
                <Td className="text-muted-foreground max-w-72 text-xs">
                  {k.kind === "publishable" ? <PublishableDetails k={k} /> : k.scopes.join(", ")}
                </Td>
                <Td className="text-muted-foreground whitespace-nowrap">{k.created}</Td>
                <Td className="text-right whitespace-nowrap">
                  {!k.revoked && (
                    <span className="inline-flex gap-1">
                      <form action={rotate}><input type="hidden" name="id" value={k.id} /><Button variant="ghost" size="sm" type="submit">Rotate</Button></form>
                      <form action={revokeKeyAction.bind(null, k.id)}><Button variant="destructive" size="sm" type="submit">Revoke</Button></form>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">Rotating creates a replacement with the same settings and revokes the old key immediately, so switch your app or widget over as soon as you copy the new key.</p>
    </div>
  );
}

function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <code className="max-w-44 truncate font-mono text-xs" title={value}>{value}</code>
      <button type="button" aria-label="Copy the publishable key" className="text-muted-foreground hover:text-foreground"
        onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the key is still selectable */ } }}>
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}

/** Where a publishable key works and how much it may be used, with a form to change both. */
function PublishableDetails({ k }: { k: KeyRow }) {
  const [state, save, pending] = useActionState<UpdateResult, FormData>(updateKeyAction.bind(null, k.id), null);
  const cap = k.monthlyCap;
  const pct = cap ? Math.min(100, (k.used / cap) * 100) : 0;
  return (
    <div className="space-y-2">
      <ul className="space-y-0.5 font-mono">{k.allowedOrigins.map((o) => <li key={o} className="truncate" title={o}>{o}</li>)}</ul>
      {cap !== null && (
        <div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={k.used} aria-label="Calls used this month">
            <div className={`h-full rounded-full ${pct >= 90 ? "bg-warning" : "bg-accent"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 tabular-nums">{k.used} of {cap} calls this month</p>
        </div>
      )}
      {!k.revoked && (
        <details>
          <summary className="hover:text-foreground cursor-pointer underline underline-offset-4">Change sites or limit</summary>
          <form action={save} className="mt-3 space-y-3">
            <div className="space-y-1.5"><Label htmlFor={`o-${k.id}`} className="text-xs">Allowed sites (one per line)</Label>
              <textarea id={`o-${k.id}`} name="origins" rows={3} defaultValue={k.allowedOrigins.join("\n")} className="bg-input/30 border-input focus-visible:ring-ring/40 w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-3" /></div>
            <div className="space-y-1.5"><Label htmlFor={`c-${k.id}`} className="text-xs">Calls per month</Label><Input id={`c-${k.id}`} name="cap" type="number" min={1} defaultValue={k.monthlyCap ?? ""} className="h-9 w-32 text-xs" /></div>
            {state?.ok === false && <Notice tone="error" className="text-xs">{state.error}</Notice>}
            {state?.ok && <p className="text-success">Saved. It applies immediately.</p>}
            <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
          </form>
        </details>
      )}
    </div>
  );
}

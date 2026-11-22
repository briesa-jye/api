"use client";

import { useActionState } from "react";
import { revokeKeyAction, rotateKeyAction, type SecretResult } from "@/app/dashboard/actions";
import { OneTimeSecret } from "@/components/dashboard/OneTimeSecret";
import { Td, Th } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/input";

export interface KeyRow { id: string; name: string; prefix: string; mode: "test" | "live"; scopes: string[]; created: string; revoked: boolean }

/** One form around the table: Rotate returns the replacement key (shown once above), Revoke posts to its own action. */
export function KeyTable({ keys }: { keys: KeyRow[] }) {
  const [state, rotate] = useActionState<SecretResult, FormData>(rotateKeyAction, null);
  return (
    <form action={rotate} className="space-y-4">
      {state?.ok && <OneTimeSecret secret={state.secret} label={state.label} kind="API key" />}
      {state?.ok === false && <Notice tone="error">{state.error}</Notice>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[40rem]">
          <thead className="bg-muted/30 border-b"><tr><Th>Name</Th><Th>Key</Th><Th>Type</Th><Th>Permissions</Th><Th>Created</Th><Th /></tr></thead>
          <tbody className="divide-y divide-dashed">
            {keys.length === 0 && <tr><Td className="text-muted-foreground py-8 text-center">No keys yet. Create your first test key below.</Td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className={k.revoked ? "opacity-50" : ""}>
                <Td>{k.name}{k.revoked && <Badge variant="outline" className="ml-2">revoked</Badge>}</Td>
                <Td className="font-mono text-xs">bk_{k.mode}_{k.prefix}...</Td>
                <Td><Badge variant={k.mode === "live" ? "amber" : "outline"}>{k.mode}</Badge></Td>
                <Td className="text-muted-foreground max-w-56 text-xs">{k.scopes.join(", ")}</Td>
                <Td className="text-muted-foreground whitespace-nowrap">{k.created}</Td>
                <Td className="text-right whitespace-nowrap">
                  {!k.revoked && (
                    <span className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" type="submit" name="id" value={k.id}>Rotate</Button>
                      <Button variant="destructive" size="sm" type="submit" formAction={revokeKeyAction.bind(null, k.id)}>Revoke</Button>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">Rotating creates a replacement with the same permissions and revokes the old key immediately, so switch your app over as soon as you copy the new key.</p>
    </form>
  );
}

import Link from "next/link";
import { OutcomePill } from "@/components/charts/OutcomePill";
import { PageHeader, Td, Th } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { requireAccount } from "@/lib/account";
import { outcomeLevel } from "@/lib/outcomes";
import { getRegistry } from "@/lib/packs";
import { getStore } from "@/lib/store";

const PAGE = 25;
type Q = { id?: string; pack?: string; mode?: string; ref?: string; after?: string };

const encode = (c: { createdAt: Date; requestId: string }) => Buffer.from(JSON.stringify([c.createdAt.toISOString(), c.requestId])).toString("base64url");
const decode = (s?: string) => {
  try { const [t, id] = JSON.parse(Buffer.from(s ?? "", "base64url").toString()) as [string, string]; const d = new Date(t); return Number.isNaN(d.getTime()) || typeof id !== "string" ? undefined : { createdAt: d, requestId: id }; } catch { return undefined; }
};
const qs = (q: Q) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(q)) if (v) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ""; };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const { tenant } = await requireAccount();
  const store = getStore();
  const lookup = q.id?.trim();
  if (lookup && /^req_[a-z0-9]+$/i.test(lookup) && (await store.getAudit(tenant.id, lookup))) {
    const { redirect } = await import("next/navigation");
    redirect(`/dashboard/audit/${lookup}`);
  }
  const rows = await store.listAudit(tenant.id, {
    limit: PAGE + 1,
    ...(q.pack && { packId: q.pack }),
    ...(q.ref && { reference: q.ref }),
    ...(q.mode === "live" && { test: false }), ...(q.mode === "test" && { test: true }),
    after: decode(q.after),
  });
  const more = rows.length > PAGE, page = rows.slice(0, PAGE);
  const packs = getRegistry().list().filter((p) => p.rules.length > 0).map((p) => p.manifest.id);

  return (
    <>
      <PageHeader title="Audit" description="Every assessment is recorded with the rule versions that decided it. Records keep a hash of the inputs, never the inputs themselves." />
      <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_9rem_1fr_1fr_auto]">
        <div className="space-y-1.5"><Label htmlFor="pack">Pack</Label><SelectMenu id="pack" name="pack" defaultValue={q.pack ?? ""} emptyLabel="All packs" placeholder="All packs" options={packs.map((p) => ({ value: p, label: p }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="mode">Mode</Label><SelectMenu id="mode" name="mode" defaultValue={q.mode ?? ""} emptyLabel="Live and test" placeholder="Live and test" options={[{ value: "live", label: "Live" }, { value: "test", label: "Test" }]} /></div>
        <div className="space-y-1.5"><Label htmlFor="ref">Your reference</Label><Input id="ref" name="ref" placeholder="exact match" defaultValue={q.ref} /></div>
        <div className="space-y-1.5"><Label htmlFor="id">Request ID</Label><Input id="id" name="id" placeholder="req_..." defaultValue={q.id} /></div>
        <div className="flex items-end"><Button type="submit" variant="brand" className="h-10 w-full">Filter</Button></div>
      </form>
      {lookup && <Notice className="mb-4">No record found for that request ID in your account. Records are removed after your retention period ({tenant.retentionDays} days).</Notice>}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[44rem]">
          <thead className="bg-muted/30 border-b"><tr><Th>When</Th><Th>Pack</Th><Th>Outcome</Th><Th>Mode</Th><Th>Reference</Th><Th>Request</Th></tr></thead>
          <tbody className="divide-y divide-dashed">
            {page.length === 0 && <tr><Td className="text-muted-foreground py-10 text-center" >No records match. Run an assessment and it appears here.</Td></tr>}
            {page.map((r) => {
              const o = (r.output as { outcome?: string; escalation_recommended?: boolean } | null) ?? {};
              return (
                <tr key={r.requestId} className="hover:bg-muted/20">
                  <Td className="whitespace-nowrap text-xs">{r.createdAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</Td>
                  <Td className="font-mono text-xs">{r.packId ?? "-"}</Td>
                  <Td><OutcomePill outcome={o.outcome ?? null} {...outcomeLevel(r.packId, o.outcome ?? null)} />{o.escalation_recommended && <Badge variant="outline" size="sm" className="ml-2">escalate</Badge>}</Td>
                  <Td><Badge variant={r.test ? "outline" : "amber"}>{r.test ? "test" : "live"}</Badge></Td>
                  <Td className="max-w-40 truncate text-xs">{r.reference ?? <span className="text-muted-foreground">-</span>}</Td>
                  <Td><Link href={`/dashboard/audit/${r.requestId}`} className="text-accent-hover font-mono text-xs underline underline-offset-4">{r.requestId}</Link></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground text-xs">{page.length} shown{q.after ? " (older)" : ""}</span>
        <span className="flex gap-2">
          {q.after && <Button asChild variant="outline" size="sm"><Link href={`/dashboard/audit${qs({ ...q, after: undefined, id: undefined })}`}>Newest</Link></Button>}
          {more && <Button asChild variant="outline" size="sm"><Link href={`/dashboard/audit${qs({ ...q, id: undefined, after: encode(page.at(-1)!) })}`}>Older</Link></Button>}
        </span>
      </div>
    </>
  );
}

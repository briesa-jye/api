import { PageHeader } from "@/components/dashboard/PageHeader";
import { CodeBlock } from "@/components/site/CodePanel";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/input";
import { requireAccount } from "@/lib/account";
import { getStore } from "@/lib/store";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { tenant } = await requireAccount();
  const requestId = id?.trim();
  const rec = requestId && /^req_[a-z0-9]+$/i.test(requestId) ? await getStore().getAudit(tenant.id, requestId) : null;
  return (
    <>
      <PageHeader title="Audit" description="Look up the stored record of any past call using the request_id from its response. Records keep a hash of the inputs, never the inputs themselves." />
      <form className="flex max-w-xl items-end gap-2">
        <div className="flex-1 space-y-2"><Label htmlFor="id">Request ID</Label><Input id="id" name="id" placeholder="req_..." defaultValue={requestId} /></div>
        <Button type="submit" variant="brand" className="h-10">Look up</Button>
      </form>
      <div className="mt-8 max-w-3xl space-y-4">
        {requestId && !rec && <Notice>No audit record found for that request ID in your account. Records are removed after your retention period ({tenant.retentionDays} days).</Notice>}
        {rec && (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[["Pack", rec.packId ? `${rec.packId} v${rec.packVersion}` : "-"], ["Mode", rec.test ? "test" : "live"], ["When", rec.createdAt.toLocaleString("en-AU")]].map(([k, v]) => (
                <div key={k}><dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">{k}</dt><dd className="mt-1 text-sm">{v}</dd></div>
              ))}
            </dl>
            <CodeBlock label="Record" code={JSON.stringify({ request_id: rec.requestId, endpoint: rec.endpoint, rule_versions: rec.ruleVersions, inputs_hash: rec.inputsHash, model: rec.model, output: rec.output }, null, 2)} />
          </>
        )}
      </div>
    </>
  );
}

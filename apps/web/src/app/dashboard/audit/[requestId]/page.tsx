import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentResult, type Core } from "@/components/dashboard/AssessmentResult";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CodeBlock } from "@/components/site/CodePanel";
import { Notice } from "@/components/ui/input";
import { requireAccount } from "@/lib/account";
import { outcomeScale } from "@/lib/outcomes";
import { getStore } from "@/lib/store";

export default async function AuditRecordPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const { tenant } = await requireAccount();
  if (!/^req_[a-z0-9]+$/i.test(requestId)) notFound();
  const rec = await getStore().getAudit(tenant.id, requestId);
  if (!rec) notFound();
  const out = rec.output as Partial<Core> | null;
  const usable = out && typeof out.outcome === "string" && Array.isArray(out.reasons) && out.pack;

  return (
    <>
      <Link href="/dashboard/audit" className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="size-3.5" aria-hidden />All records</Link>
      <PageHeader title={rec.requestId} description={`${rec.createdAt.toLocaleString("en-AU", { dateStyle: "full", timeStyle: "medium" })} · ${rec.test ? "test" : "live"} call`} />
      <dl className="mb-8 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[["Pack", rec.packId ? `${rec.packId} v${rec.packVersion}` : "-"], ["Your reference", rec.reference ?? "-"], ["Inputs hash", rec.inputsHash.slice(0, 16) + "..."], ["AI model", rec.model ?? "none"]].map(([k, v]) => (
          <div key={k} className="bg-card p-4"><dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">{k}</dt><dd className="mt-1.5 truncate font-mono text-xs">{v}</dd></div>
        ))}
      </dl>
      <div className="max-w-3xl space-y-8">
        {usable ? <AssessmentResult core={out as Core} outcomes={outcomeScale(rec.packId, out.outcome!)} /> : <Notice>This record has no stored decision to display.</Notice>}
        <div>
          <h3 className="font-display mb-2 text-base">Exact rule versions used</h3>
          <CodeBlock code={JSON.stringify(rec.ruleVersions ?? {}, null, 2)} />
          <p className="text-muted-foreground mt-2 text-xs">Re-running the same facts with <code className="font-mono">as_of</code> set to <code className="font-mono">{rec.createdAt.toISOString().slice(0, 10)}</code> applies the current rules as they stood on that date. If a rule has been reworded since, the versions above show what ran. The raw inputs are not stored, only their hash.</p>
        </div>
      </div>
    </>
  );
}

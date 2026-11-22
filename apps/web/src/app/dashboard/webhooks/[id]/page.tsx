import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Td, Th } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { requireAccount } from "@/lib/account";
import { getStore } from "@/lib/store";

export default async function DeliveriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenant } = await requireAccount();
  const store = getStore();
  const hook = (await store.listWebhookEndpoints(tenant.id)).find((h) => h.id === id);
  if (!hook) notFound();
  const rows = await store.listWebhookDeliveries(tenant.id, id, 50);
  return (
    <>
      <Link href="/dashboard/webhooks" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm no-underline">All webhooks</Link>
      <PageHeader title="Deliveries" description={`Latest 50 deliveries to ${hook.url}. Failed attempts retry after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours.`} />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[36rem]">
          <thead className="bg-muted/30 border-b"><tr><Th>Event</Th><Th>Status</Th><Th>Attempts</Th><Th>Last response</Th><Th>Next attempt</Th></tr></thead>
          <tbody className="divide-y divide-dashed">
            {rows.length === 0 && <tr><Td className="text-muted-foreground py-8 text-center">Nothing delivered yet.</Td></tr>}
            {rows.map((d) => (
              <tr key={d.id}>
                <Td className="font-mono text-xs">{d.event}</Td>
                <Td><Badge variant={d.status === "succeeded" ? "subtle" : d.status === "failed" ? "destructive" : "outline"}>{d.status}</Badge></Td>
                <Td>{d.attempts}</Td>
                <Td className="text-muted-foreground text-xs">{d.lastError ?? (d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : "-")}</Td>
                <Td className="text-muted-foreground text-xs whitespace-nowrap">{d.nextAttemptAt ? d.nextAttemptAt.toLocaleString("en-AU") : "-"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

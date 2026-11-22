import Link from "next/link";
import { PageHeader, Td, Th } from "@/components/dashboard/PageHeader";
import { WebhookForm } from "@/components/dashboard/WebhookForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteWebhookAction } from "@/app/dashboard/actions";
import { requireAccount } from "@/lib/account";
import { getRegistry } from "@/lib/packs";
import { getStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export default async function WebhooksPage() {
  const { tenant } = await requireAccount();
  const hooks = await getStore().listWebhookEndpoints(tenant.id);
  const packs = getRegistry().list().map((p) => ({ id: p.manifest.id, name: p.manifest.name }));
  return (
    <>
      <PageHeader title="Webhooks" description="Learn when rules or packs change. Deliveries are signed, retried with backoff, and logged." />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[36rem]">
          <thead className="bg-muted/30 border-b"><tr><Th>Endpoint</Th><Th>Events</Th><Th>Packs</Th><Th>Added</Th><Th /></tr></thead>
          <tbody className="divide-y divide-dashed">
            {hooks.length === 0 && <tr><Td className="text-muted-foreground py-8 text-center">No endpoints yet.</Td></tr>}
            {hooks.map((h) => (
              <tr key={h.id}>
                <Td className="max-w-64 truncate font-mono text-xs"><Link href={`/dashboard/webhooks/${h.id}`} className="hover:text-accent-hover no-underline">{h.url}</Link></Td>
                <Td><span className="flex flex-wrap gap-1">{h.events.map((e) => <Badge key={e} variant="outline">{e}</Badge>)}</span></Td>
                <Td className="text-muted-foreground text-xs">{h.packs.includes("*") ? "All my packs" : h.packs.join(", ")}</Td>
                <Td className="text-muted-foreground whitespace-nowrap">{formatDate(h.createdAt)}</Td>
                <Td className="text-right whitespace-nowrap">
                  <Button asChild variant="ghost" size="sm"><Link href={`/dashboard/webhooks/${h.id}`}>Deliveries</Link></Button>
                  <form action={deleteWebhookAction} className="inline"><input type="hidden" name="id" value={h.id} /><Button variant="destructive" size="sm" type="submit">Delete</Button></form>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-10 max-w-3xl"><WebhookForm packs={packs} /></div>
    </>
  );
}

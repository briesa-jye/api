import { PageHeader, Td, Th } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAccount } from "@/lib/account";
import { getStore } from "@/lib/store";

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: m } = await searchParams;
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : new Date().toISOString().slice(0, 7);
  const { tenant } = await requireAccount();
  const rows = (await getStore().usageSummary(tenant.id, month)).sort((a, b) => b.count - a.count);
  const live = rows.filter((r) => !r.test).reduce((n, r) => n + r.count, 0);
  const test = rows.filter((r) => r.test).reduce((n, r) => n + r.count, 0);
  return (
    <>
      <PageHeader title="Usage" description="Billable calls by pack and endpoint. Test calls are free and shown for reference. Idempotent replays are not counted.">
        <form className="flex items-end gap-2">
          <div><label htmlFor="month" className="text-muted-foreground mb-1 block text-xs">Month</label><Input id="month" name="month" type="month" defaultValue={month} className="w-44" /></div>
          <Button type="submit" variant="outline" className="h-10">Show</Button>
        </form>
      </PageHeader>
      <dl className="mb-8 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
        <div className="bg-card p-5"><dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">Live calls</dt><dd className="mt-2 text-2xl tracking-tight">{live}</dd></div>
        <div className="bg-card p-5"><dt className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">Test calls</dt><dd className="mt-2 text-2xl tracking-tight">{test}</dd></div>
      </dl>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[30rem]">
          <thead className="bg-muted/30 border-b"><tr><Th>Pack</Th><Th>Endpoint</Th><Th>Type</Th><Th className="text-right">Calls</Th></tr></thead>
          <tbody className="divide-y divide-dashed">
            {rows.length === 0 && <tr><Td className="text-muted-foreground py-8 text-center">No usage in {month}.</Td></tr>}
            {rows.map((r) => (
              <tr key={`${r.packId}${r.endpoint}${r.test}`}>
                <Td className="font-mono text-xs">{r.packId ?? "-"}</Td><Td>{r.endpoint}</Td>
                <Td><Badge variant={r.test ? "outline" : "amber"}>{r.test ? "test" : "live"}</Badge></Td>
                <Td className="text-right tabular-nums">{r.count}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

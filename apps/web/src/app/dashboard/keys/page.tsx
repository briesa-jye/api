import { liveAccessAllowed } from "@briesa/accounts/billing";
import { KeyForm } from "@/components/dashboard/KeyForm";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KeyTable } from "@/components/dashboard/KeyTable";
import { requireAccount } from "@/lib/account";
import { getRegistry } from "@/lib/packs";
import { getStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export default async function KeysPage() {
  const { tenant } = await requireAccount();
  const store = getStore();
  const keys = (await store.listApiKeys(tenant.id)).sort((a, b) => +b.createdAt - +a.createdAt);
  const month = new Date().toISOString().slice(0, 7);
  const rows = await Promise.all(keys.map(async (k) => ({
    id: k.id, name: k.name, prefix: k.prefix, mode: k.mode, scopes: k.scopes, created: formatDate(k.createdAt), revoked: !!k.revokedAt,
    kind: k.kind, publicKey: k.publicKey, allowedOrigins: k.allowedOrigins, monthlyCap: k.monthlyCap,
    used: k.monthlyCap !== null && !k.revokedAt ? await store.countKeyUsage(tenant.id, k.id, month) : 0,
  })));
  const packs = getRegistry().list().map((p) => ({ id: p.manifest.id, name: p.manifest.name }));
  // A widget should only offer packs that actually have rules.
  const widgetPacks = getRegistry().list().filter((p) => p.rules.length > 0).map((p) => ({ id: p.manifest.id, name: p.manifest.name }));

  return (
    <>
      <PageHeader title="API keys" description="Secret keys are shown once when created and cannot be recovered. Publishable keys are safe to put in a web page, so you can copy them again here." />
      <KeyTable keys={rows} />
      <div className="mt-10 max-w-3xl"><KeyForm packs={packs} widgetPacks={widgetPacks} canLive={liveAccessAllowed(tenant)} /></div>
    </>
  );
}

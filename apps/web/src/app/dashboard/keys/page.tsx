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
  const keys = (await getStore().listApiKeys(tenant.id)).sort((a, b) => +b.createdAt - +a.createdAt);
  const rows = keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, mode: k.mode, scopes: k.scopes, created: formatDate(k.createdAt), revoked: !!k.revokedAt }));
  const packs = getRegistry().list().map((p) => ({ id: p.manifest.id, name: p.manifest.name }));

  return (
    <>
      <PageHeader title="API keys" description="Keys are shown once when created. Only a prefix is kept, so a lost key must be replaced, not recovered." />
      <KeyTable keys={rows} />
      <div className="mt-10 max-w-3xl"><KeyForm packs={packs} canLive={liveAccessAllowed(tenant)} /></div>
    </>
  );
}

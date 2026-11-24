import { PageHeader } from "@/components/dashboard/PageHeader";
import { WidgetBuilder } from "@/components/dashboard/WidgetBuilder";
import { Notice } from "@/components/ui/input";
import { requireAccount } from "@/lib/account";
import { playgroundCatalog } from "@/lib/playground";
import { API_BASE_URL, SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/store";

export default async function WidgetsPage() {
  const { tenant } = await requireAccount();
  const catalog = playgroundCatalog();
  // Only publishable keys are safe to put in a page, so only those are offered.
  const keys = (await getStore().listApiKeys(tenant.id))
    .filter((k) => k.kind === "publishable" && !k.revokedAt && k.publicKey)
    .map((k) => ({ id: k.id, name: k.name, mode: k.mode, publicKey: k.publicKey!, allowedOrigins: k.allowedOrigins, scopes: k.scopes }));
  return (
    <>
      <PageHeader title="Widgets" description="Build a form your visitors fill in on your own site. It asks the questions, runs the rules and shows the result, with nothing for you to code." />
      <Notice className="mb-8 max-w-3xl">Packs marked draft have not been reviewed by a qualified person. The widget says so to every visitor, and results are decision support to be checked, never a guarantee of compliance.</Notice>
      {catalog.length === 0 ? <Notice>No packs with rules are available yet.</Notice> : <WidgetBuilder catalog={catalog} keys={keys} siteUrl={SITE_URL} apiUrl={API_BASE_URL} />}
    </>
  );
}

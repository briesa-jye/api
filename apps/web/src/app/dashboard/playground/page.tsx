import { PageHeader } from "@/components/dashboard/PageHeader";
import { Playground } from "@/components/dashboard/Playground";
import { Notice } from "@/components/ui/input";
import { requireAccount } from "@/lib/account";
import { playgroundCatalog } from "@/lib/playground";

export default async function PlaygroundPage() {
  await requireAccount();
  const catalog = playgroundCatalog();
  return (
    <>
      <PageHeader title="Playground" description="Try a pack without writing code. It runs the same rules as the API, is not billed, and nothing is stored." />
      <Notice className="mb-8 max-w-3xl">Packs marked draft are compiled from regulator guidance and have not been reviewed by a qualified person. Treat every result as decision support to check.</Notice>
      {catalog.length === 0 ? <Notice>No packs with rules are available yet.</Notice> : <Playground catalog={catalog} />}
    </>
  );
}

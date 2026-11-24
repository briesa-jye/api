import { Notice } from "@/components/ui/input";
import { QuickCheck } from "@/components/check/QuickCheck";
import { playgroundCatalog } from "@/lib/playground";

export default function CheckPage() {
  const catalog = playgroundCatalog();
  return (
    <>
      <h1 className="font-display mb-1 text-2xl tracking-tight">Quick check</h1>
      <p className="text-muted-foreground mb-6 text-sm">Answer the questions, get a result with the rules and sources behind it. Every check is saved to your audit trail under your name.</p>
      {catalog.length === 0 ? <Notice>No packs with rules are available yet.</Notice> : <QuickCheck catalog={catalog} />}
    </>
  );
}

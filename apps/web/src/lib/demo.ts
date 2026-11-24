import "server-only";
import { createKey, createWebhook } from "@briesa/accounts/manage";
import { assessPack } from "@briesa/packs/assessment";
import type { Store } from "@briesa/db";
import { getRegistry } from "@/lib/packs";

/** Local preview only (DEMO_AUTH=1): fills a fresh demo tenant with believable data so the dashboard can be seen. */
export async function seedDemo(store: Store, tenantId: string) {
  const actor = { tenantId, scopes: ["*"] };
  await createKey(store, actor, { name: "Local development", mode: "test", scopes: ["assess", "read", "audit:read", "pack:*"] });
  await createKey(store, actor, { name: "Marketing site widget", mode: "test", kind: "publishable", scopes: ["assess", "read", "pack:whs-incident-notification", "pack:real-estate-aml"], allowed_origins: ["https://www.example.com", "http://localhost:4010"] });
  await createKey(store, actor, { name: "CI smoke tests", mode: "test", scopes: ["assess", "read", "pack:whs-incident-notification"] });
  const { endpoint } = await createWebhook(store, actor, { url: "https://hooks.example.com/briesa", events: ["rules.updated", "pack.updated"], packs: ["*"] }, () => true);
  const month = new Date().toISOString().slice(0, 7);
  const use = (packId: string, count: number, test: boolean) => Promise.all(Array.from({ length: count }, () => store.recordUsage({ tenantId, keyId: "demo", packId, endpoint: "assess", test, month })));
  await use("whs-incident-notification", 14, true);
  await use("real-estate-aml", 9, true);
  await seedHistory(store, tenantId);
  const d = await store.createWebhookDelivery({ tenantId, endpointId: endpoint.id, event: "pack.updated", payload: "{}", nextAttemptAt: null });
  await store.updateWebhookDelivery(d.id, { status: "succeeded", attempts: 1, lastStatusCode: 200, deliveredAt: new Date() });
}

/** 45 days of believable assessments, produced by running each pack's own example scenarios through the real rules. */
async function seedHistory(store: Store, tenantId: string) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const packs = getRegistry().list().filter((p) => p.rules.length > 0);
  const examples = packs.flatMap((p) => p.scenarios.map((sc) => ({ p, sc })));
  let n = 0;
  for (let ago = 44; ago >= 0; ago--) {
    const growth = 0.6 + (44 - ago) / 44; // usage grows over the period
    const calls = Math.floor(rnd() * 5 * growth) + (ago % 7 === 0 || ago % 7 === 6 ? 0 : 1);
    for (let i = 0; i < calls; i++) {
      const { p, sc } = examples[Math.floor(rnd() * examples.length)]!;
      const out = assessPack(p, { scenarioType: sc.scenario_type, jurisdiction: sc.jurisdiction, inputs: sc.inputs });
      if (!out.ok) continue;
      const test = rnd() < 0.35 || ago > 30;
      const at = new Date(Date.now() - ago * 86_400_000 - Math.floor(rnd() * 8) * 3_600_000);
      await store.appendAudit({
        requestId: `req_demo${String(++n).padStart(4, "0")}`, tenantId, keyId: "demo", endpoint: "assess", packId: p.manifest.id, packVersion: p.manifest.version,
        ruleVersions: Object.fromEntries(out.result.reasons.map((r) => [r.rule_id, r.rule_version])), inputsHash: Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join(""),
        output: { ...out.core, reference: rnd() < 0.4 ? `matter-${1000 + n}` : null }, reference: rnd() < 0.4 ? `matter-${1000 + n}` : null, model: null, test, createdAt: at,
      });
    }
  }
}

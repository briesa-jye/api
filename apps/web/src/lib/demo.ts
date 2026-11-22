import "server-only";
import { createKey, createWebhook } from "@briesa/accounts/manage";
import type { Store } from "@briesa/db";

/** Local preview only (DEMO_AUTH=1): fills a fresh demo tenant with believable data so the dashboard can be seen. */
export async function seedDemo(store: Store, tenantId: string) {
  const actor = { tenantId, scopes: ["*"] };
  await createKey(store, actor, { name: "Local development", mode: "test", scopes: ["assess", "read", "audit:read", "pack:*"] });
  await createKey(store, actor, { name: "CI smoke tests", mode: "test", scopes: ["assess", "read", "pack:whs-incident-notification"] });
  const { endpoint } = await createWebhook(store, actor, { url: "https://hooks.example.com/briesa", events: ["rules.updated", "pack.updated"], packs: ["*"] }, () => true);
  const month = new Date().toISOString().slice(0, 7);
  const use = (packId: string, count: number, test: boolean) => Promise.all(Array.from({ length: count }, () => store.recordUsage({ tenantId, keyId: "demo", packId, endpoint: "assess", test, month })));
  await use("whs-incident-notification", 14, true);
  await use("real-estate-aml", 9, true);
  await store.appendAudit({
    requestId: "req_demo0001", tenantId, keyId: "demo", endpoint: "assess", packId: "whs-incident-notification", packVersion: "0.1.0",
    ruleVersions: { "notifiable-incident": "1.0.0", "regulator-nsw": "1.0.0" }, inputsHash: "6119442ca08d7f1c0e2b9d3a54c8e7b1f20d4a96c3e58b7d1a0f92e4c6b8d3a5",
    output: { outcome: "notifiable", escalation_recommended: true, pack: { id: "whs-incident-notification", version: "0.1.0", status: "draft" }, human_review_recommended: true }, model: null, test: true,
  });
  const d = await store.createWebhookDelivery({ tenantId, endpointId: endpoint.id, event: "pack.updated", payload: "{}", nextAttemptAt: null });
  await store.updateWebhookDelivery(d.id, { status: "succeeded", attempts: 1, lastStatusCode: 200, deliveredAt: new Date() });
}

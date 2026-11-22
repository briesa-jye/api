import { randomUUID } from "node:crypto";
import type {
  ApiKeyRecord, AuditRecord, IdempotencyRecord, Store, Tenant, UsageEvent, UsageSummaryRow,
  WebhookDelivery, WebhookEndpoint, WebhookEvent,
} from "./types.ts";

/** In-memory Store for tests and local dev. Same contract as PrismaStore. */
export class MemoryStore implements Store {
  private tenants = new Map<string, Tenant>();
  private keys = new Map<string, ApiKeyRecord>();
  private usage: UsageEvent[] = [];
  private audits: AuditRecord[] = [];
  private idem: IdempotencyRecord[] = [];

  async createTenant(input: { name: string; retentionDays?: number }) {
    const t: Tenant = {
      id: randomUUID(), name: input.name,
      retentionDays: input.retentionDays ?? 365, createdAt: new Date(),
    };
    this.tenants.set(t.id, t);
    return t;
  }
  async getTenant(id: string) { return this.tenants.get(id) ?? null; }

  async createApiKey(input: Omit<ApiKeyRecord, "id" | "createdAt" | "revokedAt">) {
    const k: ApiKeyRecord = { ...input, id: randomUUID(), createdAt: new Date(), revokedAt: null };
    this.keys.set(k.id, k);
    return k;
  }
  async findApiKeyByPrefix(prefix: string) {
    return [...this.keys.values()].find((k) => k.prefix === prefix) ?? null;
  }
  async listApiKeys(tenantId: string) {
    return [...this.keys.values()].filter((k) => k.tenantId === tenantId);
  }
  async revokeApiKey(tenantId: string, keyId: string) {
    const k = this.keys.get(keyId);
    if (!k || k.tenantId !== tenantId) return null;
    k.revokedAt ??= new Date();
    return k;
  }

  async recordUsage(e: Omit<UsageEvent, "createdAt">) {
    this.usage.push({ ...e, createdAt: new Date() });
  }
  async usageSummary(tenantId: string, month: string) {
    const rows = new Map<string, UsageSummaryRow>();
    for (const e of this.usage) {
      if (e.tenantId !== tenantId || e.month !== month) continue;
      const id = `${e.packId}|${e.endpoint}|${e.test}`;
      const r = rows.get(id) ?? { packId: e.packId, endpoint: e.endpoint, test: e.test, count: 0 };
      r.count++;
      rows.set(id, r);
    }
    return [...rows.values()];
  }

  async appendAudit(r: Omit<AuditRecord, "createdAt">) {
    this.audits.push({ ...r, createdAt: new Date() });
  }
  async getAudit(tenantId: string, requestId: string) {
    return this.audits.find((a) => a.tenantId === tenantId && a.requestId === requestId) ?? null;
  }

  async getIdempotency(tenantId: string, key: string) {
    return this.idem.find((r) => r.tenantId === tenantId && r.key === key) ?? null;
  }
  async saveIdempotency(r: Omit<IdempotencyRecord, "createdAt">) {
    this.idem.push({ ...r, createdAt: new Date() });
  }

  private endpoints: WebhookEndpoint[] = [];
  private deliveries: WebhookDelivery[] = [];

  async createWebhookEndpoint(input: Omit<WebhookEndpoint, "id" | "createdAt" | "disabledAt">) {
    const e: WebhookEndpoint = { ...input, id: randomUUID(), createdAt: new Date(), disabledAt: null };
    this.endpoints.push(e);
    return e;
  }
  async listWebhookEndpoints(tenantId: string) {
    return this.endpoints.filter((e) => e.tenantId === tenantId && !e.disabledAt);
  }
  async disableWebhookEndpoint(tenantId: string, id: string) {
    const e = this.endpoints.find((x) => x.id === id && x.tenantId === tenantId && !x.disabledAt);
    if (!e) return false;
    e.disabledAt = new Date();
    for (const d of this.deliveries) if (d.endpointId === id && d.status === "pending") { d.status = "failed"; d.lastError = "endpoint deleted"; d.nextAttemptAt = null; }
    return true;
  }
  async listWebhookDeliveries(tenantId: string, endpointId: string, limit: number) {
    return this.deliveries.filter((d) => d.tenantId === tenantId && d.endpointId === endpointId).slice(-limit).reverse();
  }
  async systemListWebhookEndpoints(event: WebhookEvent) {
    return this.endpoints.filter((e) => !e.disabledAt && e.events.includes(event));
  }
  async systemGetWebhookEndpoint(id: string) { return this.endpoints.find((e) => e.id === id) ?? null; }
  async createWebhookDelivery(input: Omit<WebhookDelivery, "id" | "createdAt" | "deliveredAt" | "attempts" | "lastStatusCode" | "lastError" | "status">) {
    const d: WebhookDelivery = { ...input, id: randomUUID(), createdAt: new Date(), deliveredAt: null, attempts: 0, lastStatusCode: null, lastError: null, status: "pending" };
    this.deliveries.push(d);
    return d;
  }
  async claimDueWebhookDeliveries(now: Date, limit: number, leaseMs: number) {
    const due = this.deliveries.filter((d) => d.status === "pending" && d.nextAttemptAt && d.nextAttemptAt <= now).slice(0, limit);
    for (const d of due) d.nextAttemptAt = new Date(now.getTime() + leaseMs);
    return due.map((d) => ({ ...d }));
  }
  async updateWebhookDelivery(id: string, patch: Partial<WebhookDelivery>) {
    const d = this.deliveries.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
  }
}

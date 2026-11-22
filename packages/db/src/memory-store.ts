import { randomUUID } from "node:crypto";
import type {
  ApiKeyRecord, AuditRecord, IdempotencyRecord, Store, Tenant, UsageEvent, UsageSummaryRow,
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
}

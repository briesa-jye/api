import { randomUUID } from "node:crypto";
import { FINISHED_DELIVERY_TTL_MS, IDEMPOTENCY_TTL_MS } from "./types.ts";
import type {
  ApiKeyRecord, AuditRecord, IdempotencyRecord, Store, Tenant, UsageEvent, UsageSummaryRow,
  WebhookDelivery, WebhookEndpoint, WebhookEvent, PurgeResult, TenantBillingPatch, TenantMember,
} from "./types.ts";

/** In-memory Store for tests and local dev. Same contract as PrismaStore. */
export class MemoryStore implements Store {
  private tenants = new Map<string, Tenant>();
  private keys = new Map<string, ApiKeyRecord>();
  private usage: UsageEvent[] = [];
  private audits: AuditRecord[] = [];
  private idem: IdempotencyRecord[] = [];

  async createTenant(input: { name: string; retentionDays?: number; billingExempt?: boolean }) {
    const t: Tenant = {
      id: randomUUID(), name: input.name, retentionDays: input.retentionDays ?? 365, createdAt: new Date(),
      billingExempt: input.billingExempt ?? false, stripeCustomerId: null, subscriptionStatus: "none",
      subscriptionId: null, planId: null, licensedPacks: [], currentPeriodEnd: null,
    };
    this.tenants.set(t.id, t);
    return t;
  }
  async updateTenantBilling(tenantId: string, patch: TenantBillingPatch) {
    const t = this.tenants.get(tenantId);
    if (!t) return false;
    if (patch.stripeCustomerId) {
      const clash = [...this.tenants.values()].some((x) => x.id !== tenantId && x.stripeCustomerId === patch.stripeCustomerId);
      if (clash) throw new Error("stripe customer already linked"); // mirrors the unique index
    }
    Object.assign(t, patch);
    return true;
  }
  async findTenantByStripeCustomer(customerId: string) {
    return [...this.tenants.values()].find((t) => t.stripeCustomerId === customerId) ?? null;
  }
  private members: TenantMember[] = [];
  private stripeEvents = new Set<string>();
  async findMembershipByUser(userId: string) {
    const member = this.members.find((m) => m.userId === userId);
    const tenant = member ? this.tenants.get(member.tenantId) : undefined;
    return member && tenant ? { member, tenant } : null;
  }
  async ensureTenantForUser(input: { userId: string; email: string; tenantName: string }) {
    // No await between the check and the insert, so concurrent callers cannot both create a tenant.
    const found = this.members.find((m) => m.userId === input.userId);
    if (found) return { member: found, tenant: this.tenants.get(found.tenantId)!, created: false };
    const tenant: Tenant = {
      id: randomUUID(), name: input.tenantName, retentionDays: 365, createdAt: new Date(), billingExempt: false,
      stripeCustomerId: null, subscriptionStatus: "none", subscriptionId: null, planId: null, licensedPacks: [], currentPeriodEnd: null,
    };
    this.tenants.set(tenant.id, tenant);
    const member: TenantMember = { id: randomUUID(), tenantId: tenant.id, userId: input.userId, email: input.email, role: "owner", createdAt: new Date() };
    this.members.push(member);
    return { member, tenant, created: true };
  }
  async claimStripeEvent(eventId: string) {
    if (this.stripeEvents.has(eventId)) return false;
    this.stripeEvents.add(eventId);
    return true;
  }
  async getTenant(id: string) { return this.tenants.get(id) ?? null; }
  async setTenantRetention(tenantId: string, retentionDays: number) {
    const t = this.tenants.get(tenantId);
    if (!t) return false;
    t.retentionDays = retentionDays;
    return true;
  }
  async purgeExpired(now: Date): Promise<PurgeResult> {
    const r = { audit: 0, idempotency: 0, deliveries: 0 };
    const keepAudit = this.audits.filter((a) => {
      const days = this.tenants.get(a.tenantId)?.retentionDays ?? 365;
      return a.createdAt.getTime() >= now.getTime() - days * 86_400_000;
    });
    r.audit = this.audits.length - keepAudit.length; this.audits = keepAudit;
    const keepIdem = this.idem.filter((i) => i.createdAt.getTime() >= now.getTime() - IDEMPOTENCY_TTL_MS);
    r.idempotency = this.idem.length - keepIdem.length; this.idem = keepIdem;
    const keepDel = this.deliveries.filter((d) => d.status === "pending" || d.createdAt.getTime() >= now.getTime() - FINISHED_DELIVERY_TTL_MS);
    r.deliveries = this.deliveries.length - keepDel.length; this.deliveries = keepDel;
    return r;
  }
  async eraseTenantData(tenantId: string): Promise<PurgeResult> {
    const before = { audit: this.audits.length, idempotency: this.idem.length, deliveries: this.deliveries.length };
    this.audits = this.audits.filter((a) => a.tenantId !== tenantId);
    this.idem = this.idem.filter((i) => i.tenantId !== tenantId);
    this.deliveries = this.deliveries.filter((d) => d.tenantId !== tenantId);
    return { audit: before.audit - this.audits.length, idempotency: before.idempotency - this.idem.length, deliveries: before.deliveries - this.deliveries.length };
  }

  async createApiKey(input: Omit<ApiKeyRecord, "id" | "createdAt" | "revokedAt">) {
    if ([...this.keys.values()].some((x) => x.prefix === input.prefix)) throw new Error("duplicate key prefix"); // mirrors the database unique constraint
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
    return this.idem.find((r) => r.tenantId === tenantId && r.key === key && r.createdAt.getTime() > Date.now() - IDEMPOTENCY_TTL_MS) ?? null;
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

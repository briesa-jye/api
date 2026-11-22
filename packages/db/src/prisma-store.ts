import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FINISHED_DELIVERY_TTL_MS, IDEMPOTENCY_TTL_MS } from "./types.ts";
import type {
  ApiKeyRecord, AuditRecord, IdempotencyRecord, KeyMode, PurgeResult, Store, Tenant, UsageEvent, UsageSummaryRow,
  WebhookDelivery, WebhookEndpoint, WebhookEvent, TenantBillingPatch, TenantMember,
} from "./types.ts";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Timestamps are stored without a time zone, as UTC. Be explicit so a non-UTC session time zone cannot shift them. */
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
const json = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const toKey = (k: { mode: string } & Omit<ApiKeyRecord, "mode">): ApiKeyRecord => ({ ...k, mode: k.mode as KeyMode });
const toEndpoint = (e: { events: string[] } & Omit<WebhookEndpoint, "events">): WebhookEndpoint => ({ ...e, events: e.events as WebhookEvent[] });
const toDelivery = (d: { event: string; status: string } & Omit<WebhookDelivery, "event" | "status">): WebhookDelivery =>
  ({ ...d, event: d.event as WebhookEvent, status: d.status as WebhookDelivery["status"] });

/** Postgres-backed Store. Every tenant-scoped method filters by tenantId in the query itself. */
export class PrismaStore implements Store {
  private db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }
  disconnect() { return this.db.$disconnect(); }

  // --- tenants
  async createTenant(input: { name: string; retentionDays?: number; billingExempt?: boolean }): Promise<Tenant> {
    return this.db.tenant.create({ data: { name: input.name, ...(input.retentionDays ? { retentionDays: input.retentionDays } : {}), billingExempt: input.billingExempt ?? false } });
  }
  async updateTenantBilling(tenantId: string, patch: TenantBillingPatch) {
    return (await this.db.tenant.updateMany({ where: { id: tenantId }, data: patch })).count > 0;
  }
  async findTenantByStripeCustomer(customerId: string) {
    return this.db.tenant.findUnique({ where: { stripeCustomerId: customerId } });
  }
  async findMembershipByUser(userId: string) {
    const m = await this.db.tenantMember.findUnique({ where: { userId }, include: { tenant: true } });
    if (!m) return null;
    const { tenant, ...member } = m;
    return { member: member as TenantMember, tenant };
  }
  async ensureTenantForUser(input: { userId: string; email: string; tenantName: string }) {
    const existing = await this.findMembershipByUser(input.userId);
    if (existing) return { ...existing, created: false };
    try {
      const r = await this.db.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: input.tenantName } });
        const member = await tx.tenantMember.create({ data: { tenantId: tenant.id, userId: input.userId, email: input.email, role: "owner" } });
        return { tenant, member: member as TenantMember };
      });
      return { ...r, created: true };
    } catch (e) {
      if (!isUnique(e)) throw e;
      const again = await this.findMembershipByUser(input.userId); // lost a race with a concurrent sign-in
      if (!again) throw e;
      return { ...again, created: false };
    }
  }
  async releaseStripeEvent(eventId: string) { await this.db.stripeEvent.deleteMany({ where: { id: eventId } }); }
  async claimStripeEvent(eventId: string) {
    try { await this.db.stripeEvent.create({ data: { id: eventId } }); return true; }
    catch (e) { if (isUnique(e)) return false; throw e; }
  }
  async getTenant(id: string) { return this.db.tenant.findUnique({ where: { id } }); }
  async setTenantRetention(tenantId: string, retentionDays: number) {
    return (await this.db.tenant.updateMany({ where: { id: tenantId }, data: { retentionDays } })).count > 0;
  }

  /** Audit records are append-only: a database trigger blocks UPDATE and DELETE unless this flag is set for the transaction. */
  private async asRetention<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('briesa.retention', 'on', true)`;
      return fn(tx);
    });
  }

  async purgeExpired(now: Date): Promise<PurgeResult> {
    return this.asRetention(async (tx) => {
      const audit = await tx.$executeRaw`DELETE FROM "AuditRecord" a USING "Tenant" t
        WHERE a."tenantId" = t.id AND a."createdAt" < ${utc(now)} - (t."retentionDays" * interval '1 day')`;
      const idempotency = (await tx.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_TTL_MS) } } })).count;
      const deliveries = (await tx.webhookDelivery.deleteMany({ where: { status: { not: "pending" }, createdAt: { lt: new Date(now.getTime() - FINISHED_DELIVERY_TTL_MS) } } })).count;
      return { audit, idempotency, deliveries };
    });
  }
  async eraseTenantData(tenantId: string): Promise<PurgeResult> {
    return this.asRetention(async (tx) => ({
      audit: (await tx.auditRecord.deleteMany({ where: { tenantId } })).count,
      idempotency: (await tx.idempotencyRecord.deleteMany({ where: { tenantId } })).count,
      deliveries: (await tx.webhookDelivery.deleteMany({ where: { tenantId } })).count,
    }));
  }

  // --- api keys
  async createApiKey(input: Omit<ApiKeyRecord, "id" | "createdAt" | "revokedAt">) {
    return toKey(await this.db.apiKey.create({ data: input }));
  }
  async findApiKeyByPrefix(prefix: string) {
    const k = await this.db.apiKey.findUnique({ where: { prefix } });
    return k ? toKey(k) : null;
  }
  async listApiKeys(tenantId: string) {
    return (await this.db.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } })).map(toKey);
  }
  async revokeApiKey(tenantId: string, keyId: string) {
    await this.db.apiKey.updateMany({ where: { id: keyId, tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
    const k = await this.db.apiKey.findFirst({ where: { id: keyId, tenantId } });
    return k ? toKey(k) : null;
  }

  // --- usage
  async recordUsage(e: Omit<UsageEvent, "createdAt">) { await this.db.usageEvent.create({ data: e }); }
  async usageSummary(tenantId: string, month: string): Promise<UsageSummaryRow[]> {
    const rows = await this.db.usageEvent.groupBy({ by: ["packId", "endpoint", "test"], where: { tenantId, month }, _count: { _all: true } });
    return rows.map((r) => ({ packId: r.packId, endpoint: r.endpoint, test: r.test, count: r._count._all }));
  }

  // --- audit
  async appendAudit(r: Omit<AuditRecord, "createdAt">) {
    await this.db.auditRecord.create({ data: { ...r, ruleVersions: json(r.ruleVersions), output: json(r.output) } });
  }
  async getAudit(tenantId: string, requestId: string): Promise<AuditRecord | null> {
    const a = await this.db.auditRecord.findUnique({ where: { tenantId_requestId: { tenantId, requestId } } });
    return a ? { ...a, ruleVersions: a.ruleVersions as Record<string, string> | null, output: a.output } : null;
  }

  // --- idempotency
  async getIdempotency(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.db.idempotencyRecord.findFirst({ where: { tenantId, key, createdAt: { gt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } } });
  }
  async saveIdempotency(r: Omit<IdempotencyRecord, "createdAt">) {
    try { await this.db.idempotencyRecord.create({ data: r }); } catch (e) { if (!isUnique(e)) throw e; }
  }

  // --- webhooks
  async createWebhookEndpoint(input: Omit<WebhookEndpoint, "id" | "createdAt" | "disabledAt">) {
    return toEndpoint(await this.db.webhookEndpoint.create({ data: input }));
  }
  async listWebhookEndpoints(tenantId: string) {
    return (await this.db.webhookEndpoint.findMany({ where: { tenantId, disabledAt: null }, orderBy: { createdAt: "asc" } })).map(toEndpoint);
  }
  async disableWebhookEndpoint(tenantId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const r = await tx.webhookEndpoint.updateMany({ where: { id, tenantId, disabledAt: null }, data: { disabledAt: new Date() } });
      if (r.count === 0) return false;
      await tx.webhookDelivery.updateMany({ where: { endpointId: id, status: "pending" }, data: { status: "failed", lastError: "endpoint deleted", nextAttemptAt: null } });
      return true;
    });
  }
  async listWebhookDeliveries(tenantId: string, endpointId: string, limit: number) {
    return (await this.db.webhookDelivery.findMany({ where: { tenantId, endpointId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit })).map(toDelivery);
  }
  async systemListWebhookEndpoints(event: WebhookEvent) {
    return (await this.db.webhookEndpoint.findMany({ where: { disabledAt: null, events: { has: event } } })).map(toEndpoint);
  }
  async systemGetWebhookEndpoint(id: string) {
    const e = await this.db.webhookEndpoint.findUnique({ where: { id } });
    return e ? toEndpoint(e) : null;
  }
  async createWebhookDelivery(input: Omit<WebhookDelivery, "id" | "createdAt" | "deliveredAt" | "attempts" | "lastStatusCode" | "lastError" | "status">) {
    return toDelivery(await this.db.webhookDelivery.create({ data: { ...input, status: "pending" } }));
  }
  /** FOR UPDATE SKIP LOCKED lets several workers claim disjoint batches without double delivery. */
  async claimDueWebhookDeliveries(now: Date, limit: number, leaseMs: number) {
    const lease = new Date(now.getTime() + leaseMs);
    const rows = await this.db.$queryRaw<WebhookDelivery[]>`
      UPDATE "WebhookDelivery" d SET "nextAttemptAt" = ${utc(lease)}
      FROM (SELECT id FROM "WebhookDelivery"
            WHERE status = 'pending' AND "nextAttemptAt" <= ${utc(now)}
            ORDER BY "nextAttemptAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED) due
      WHERE d.id = due.id
      RETURNING d.*`;
    return rows.map(toDelivery);
  }
  async updateWebhookDelivery(id: string, patch: Partial<Pick<WebhookDelivery, "status" | "attempts" | "lastStatusCode" | "lastError" | "nextAttemptAt" | "deliveredAt">>) {
    await this.db.webhookDelivery.update({ where: { id }, data: patch });
  }
}

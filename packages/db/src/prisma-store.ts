import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decryptSecret, encryptSecret, isEncrypted } from "./secretbox.ts";
import { FINISHED_DELIVERY_TTL_MS, IDEMPOTENCY_PENDING_MS, IDEMPOTENCY_TTL_MS } from "./types.ts";
import type {
  ApiKeyRecord, ApiKeyUpdate, AuditInput, AuditListQuery, AuditRecord, AuditStatRow, IdempotencyClaim, IdempotencyRecord, KeyKind, KeyMode, NewApiKey, PurgeResult, Store, Tenant, UsageEvent, UsageSummaryRow,
  WebhookDelivery, WebhookEndpoint, WebhookEvent, TenantBillingPatch, TenantMember,
} from "./types.ts";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Timestamps are stored without a time zone, as UTC. Be explicit so a non-UTC session time zone cannot shift them. */
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
const json = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const toKey = (k: { mode: string; kind: string } & Omit<ApiKeyRecord, "mode" | "kind">): ApiKeyRecord => ({ ...k, mode: k.mode as KeyMode, kind: k.kind as KeyKind });
const toDelivery = (d: { event: string; status: string } & Omit<WebhookDelivery, "event" | "status">): WebhookDelivery =>
  ({ ...d, event: d.event as WebhookEvent, status: d.status as WebhookDelivery["status"] });

/** Postgres-backed Store. Every tenant-scoped method filters by tenantId in the query itself. */
export class PrismaStore implements Store {
  private db: PrismaClient;
  private secretKey: Buffer | null;
  /** `secretKey` encrypts webhook signing secrets at rest (AES-256-GCM). Without it they are stored as given. */
  constructor(db: PrismaClient, opts: { secretKey?: Buffer | null } = {}) { this.db = db; this.secretKey = opts.secretKey ?? null; }
  private toEndpoint = (e: { events: string[] } & Omit<WebhookEndpoint, "events">): WebhookEndpoint =>
    ({ ...e, events: e.events as WebhookEvent[], secret: decryptSecret(e.secret, this.secretKey) });
  /** Encrypts any plaintext webhook secrets already stored. Idempotent; returns how many rows changed. */
  async encryptLegacySecrets(): Promise<number> {
    if (!this.secretKey) return 0;
    let n = 0;
    for (const e of await this.db.webhookEndpoint.findMany({ select: { id: true, secret: true } })) {
      if (isEncrypted(e.secret)) continue;
      await this.db.webhookEndpoint.update({ where: { id: e.id }, data: { secret: encryptSecret(e.secret, this.secretKey) } });
      n++;
    }
    return n;
  }
  async hitRateWindow(key: string, windowStart: Date) {
    const rows = await this.db.$queryRaw<{ count: number }[]>`INSERT INTO "RateWindow" ("key", "windowStart", "count")
      VALUES (${key}, ${utc(windowStart)}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateWindow"."count" + 1
      RETURNING "count"`;
    return rows[0]!.count;
  }
  disconnect() { return this.db.$disconnect(); }
  async ping() { await this.db.$queryRaw`SELECT 1`; }

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
      await tx.rateWindow.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 3_600_000) } } });
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
  async createApiKey(input: NewApiKey) {
    return toKey(await this.db.apiKey.create({ data: input }));
  }
  async updateApiKey(tenantId: string, keyId: string, patch: ApiKeyUpdate) {
    const data = { ...(patch.name !== undefined && { name: patch.name }), ...(patch.allowedOrigins !== undefined && { allowedOrigins: patch.allowedOrigins }), ...(patch.monthlyCap !== undefined && { monthlyCap: patch.monthlyCap }), ...(patch.rateLimitPerMinute !== undefined && { rateLimitPerMinute: patch.rateLimitPerMinute }) };
    const { count } = await this.db.apiKey.updateMany({ where: { id: keyId, tenantId, revokedAt: null }, data });
    if (count === 0) return null;
    const k = await this.db.apiKey.findFirst({ where: { id: keyId, tenantId } });
    return k ? toKey(k) : null;
  }
  countKeyUsage(tenantId: string, keyId: string, month: string) {
    return this.db.usageEvent.count({ where: { tenantId, keyId, month } });
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
  async appendAudit(r: AuditInput) {
    await this.db.auditRecord.create({ data: { ...r, reference: r.reference ?? null, ruleVersions: json(r.ruleVersions), output: json(r.output) } });
  }
  async listAudit(tenantId: string, q: AuditListQuery): Promise<AuditRecord[]> {
    const rows = await this.db.auditRecord.findMany({
      where: {
        tenantId,
        ...(q.packId !== undefined && { packId: q.packId }),
        ...(q.reference !== undefined && { reference: q.reference }),
        ...(q.test !== undefined && { test: q.test }),
        ...(q.after && { OR: [{ createdAt: { lt: q.after.createdAt } }, { createdAt: q.after.createdAt, requestId: { lt: q.after.requestId } }] }),
      },
      orderBy: [{ createdAt: "desc" }, { requestId: "desc" }],
      take: q.limit,
    });
    return rows.map((a) => ({ ...a, ruleVersions: a.ruleVersions as Record<string, string> | null, output: a.output }));
  }
  async auditStats(tenantId: string, since: Date): Promise<AuditStatRow[]> {
    const rows = await this.db.$queryRaw<{ day: string; packId: string | null; test: boolean; outcome: string | null; escalated: boolean; count: number }[]>(Prisma.sql`
      SELECT to_char("createdAt" AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD') AS day,
             "packId", "test", "output"->>'outcome' AS outcome,
             COALESCE(("output"->>'escalation_recommended')::boolean, false) AS escalated,
             COUNT(*)::int AS count
      FROM "AuditRecord"
      WHERE "tenantId" = ${tenantId} AND "endpoint" = 'assess' AND "createdAt" >= ${since}
      GROUP BY 1, 2, 3, 4, 5`);
    return rows;
  }
  async getAudit(tenantId: string, requestId: string): Promise<AuditRecord | null> {
    const a = await this.db.auditRecord.findUnique({ where: { tenantId_requestId: { tenantId, requestId } } });
    return a ? { ...a, ruleVersions: a.ruleVersions as Record<string, string> | null, output: a.output } : null;
  }

  // --- idempotency
  async claimIdempotency(tenantId: string, key: string, requestHash: string): Promise<IdempotencyClaim> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.db.idempotencyRecord.create({ data: { tenantId, key, requestHash, status: 0, responseBody: "" } });
        return { claimed: true };
      } catch (e) {
        if (!isUnique(e)) throw e;
      }
      const existing = await this.db.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId, key } } });
      if (!existing) continue; // released between our insert and read: try again
      const now = Date.now();
      const expired = existing.createdAt.getTime() <= now - IDEMPOTENCY_TTL_MS;
      const abandoned = existing.status === 0 && existing.createdAt.getTime() <= now - IDEMPOTENCY_PENDING_MS;
      if (!expired && !abandoned) return { claimed: false, record: existing };
      // Only the caller whose delete matches this exact row may re-claim it.
      await this.db.idempotencyRecord.deleteMany({ where: { tenantId, key, createdAt: existing.createdAt } });
    }
    const last = await this.db.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId, key } } });
    if (last) return { claimed: false, record: last };
    throw new Error("could not claim idempotency key");
  }
  async completeIdempotency(tenantId: string, key: string, status: number, responseBody: string) {
    await this.db.idempotencyRecord.updateMany({ where: { tenantId, key }, data: { status, responseBody } });
  }
  async releaseIdempotency(tenantId: string, key: string) {
    await this.db.idempotencyRecord.deleteMany({ where: { tenantId, key } });
  }

  // --- webhooks
  async createWebhookEndpoint(input: Omit<WebhookEndpoint, "id" | "createdAt" | "disabledAt">) {
    return this.toEndpoint(await this.db.webhookEndpoint.create({ data: { ...input, secret: this.secretKey ? encryptSecret(input.secret, this.secretKey) : input.secret } }));
  }
  async listWebhookEndpoints(tenantId: string) {
    return (await this.db.webhookEndpoint.findMany({ where: { tenantId, disabledAt: null }, orderBy: { createdAt: "asc" } })).map(this.toEndpoint);
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
    return (await this.db.webhookEndpoint.findMany({ where: { disabledAt: null, events: { has: event } } })).map(this.toEndpoint);
  }
  async systemGetWebhookEndpoint(id: string) {
    const e = await this.db.webhookEndpoint.findUnique({ where: { id } });
    return e ? this.toEndpoint(e) : null;
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

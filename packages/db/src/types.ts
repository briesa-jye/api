export type KeyMode = "test" | "live";

export const SUBSCRIPTION_STATUSES = ["none", "trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface Tenant {
  id: string;
  name: string;
  retentionDays: number;
  createdAt: Date;
  /** Provisioned by Briesa (design partners, enterprise, internal): live keys work without a Stripe subscription. */
  billingExempt: boolean;
  stripeCustomerId: string | null;
  subscriptionStatus: string;
  subscriptionId: string | null;
  planId: string | null;
  /** Pack ids the subscription licenses, or ["*"] for all. Ignored for billingExempt tenants and for test keys. */
  licensedPacks: string[];
  currentPeriodEnd: Date | null;
}

export type TenantBillingPatch = Partial<Pick<Tenant, "stripeCustomerId" | "subscriptionStatus" | "subscriptionId" | "planId" | "licensedPacks" | "currentPeriodEnd" | "billingExempt">>;

/** A dashboard user (Supabase Auth user id) and the tenant they manage. */
export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  hash: string;
  mode: KeyMode;
  scopes: string[];
  rateLimitPerMinute: number;
  createdAt: Date;
  revokedAt: Date | null;
  rotatedFromId: string | null;
}

export interface UsageEvent {
  tenantId: string;
  keyId: string;
  packId: string | null;
  endpoint: string;
  test: boolean;
  month: string;
  createdAt: Date;
}

export interface AuditRecord {
  requestId: string;
  tenantId: string;
  keyId: string;
  endpoint: string;
  packId: string | null;
  packVersion: string | null;
  ruleVersions: Record<string, string> | null;
  inputsHash: string;
  output: unknown;
  model: string | null;
  test: boolean;
  createdAt: Date;
}

export interface IdempotencyRecord {
  tenantId: string;
  key: string;
  requestHash: string;
  status: number;
  responseBody: string;
  createdAt: Date;
}

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const FINISHED_DELIVERY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PurgeResult { audit: number; idempotency: number; deliveries: number }

export interface UsageSummaryRow {
  packId: string | null;
  endpoint: string;
  test: boolean;
  count: number;
}

export const WEBHOOK_EVENTS = ["assessment.completed", "rules.updated", "pack.updated"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  events: WebhookEvent[];
  /** Pack ids this endpoint receives events for, or ["*"] for every pack the tenant can access. */
  packs: string[];
  secret: string;
  createdAt: Date;
  disabledAt: Date | null;
}

export interface WebhookDelivery {
  id: string;
  tenantId: string;
  endpointId: string;
  event: WebhookEvent;
  /** JSON envelope, signed at send time. Contains no raw caller inputs. */
  payload: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

/**
 * Every method that touches tenant data takes tenantId and must filter by it.
 * The only global lookup is findApiKeyByPrefix, needed to authenticate.
 */
export interface Store {
  createTenant(input: { name: string; retentionDays?: number; billingExempt?: boolean }): Promise<Tenant>;
  updateTenantBilling(tenantId: string, patch: TenantBillingPatch): Promise<boolean>;
  /** System lookups used by the dashboard and the Stripe webhook. */
  findTenantByStripeCustomer(customerId: string): Promise<Tenant | null>;
  findMembershipByUser(userId: string): Promise<{ member: TenantMember; tenant: Tenant } | null>;
  /** Returns the user's tenant, creating tenant + owner membership (atomically) on first sign-in. */
  ensureTenantForUser(input: { userId: string; email: string; tenantName: string }): Promise<{ member: TenantMember; tenant: Tenant; created: boolean }>;
  /** True the first time an event id is seen, false for replays. */
  claimStripeEvent(eventId: string): Promise<boolean>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  setTenantRetention(tenantId: string, retentionDays: number): Promise<boolean>;
  /**
   * Retention job. Deletes audit records older than each tenant's retentionDays, idempotency records older than
   * IDEMPOTENCY_TTL_MS, and finished webhook deliveries older than FINISHED_DELIVERY_TTL_MS.
   */
  purgeExpired(now: Date): Promise<PurgeResult>;
  /**
   * Right to erasure: removes a tenant's audit records, idempotency records and webhook deliveries.
   * Keeps the tenant, keys, endpoints and usage counts (billing records contain no assessment data).
   */
  eraseTenantData(tenantId: string): Promise<PurgeResult>;

  createApiKey(input: Omit<ApiKeyRecord, "id" | "createdAt" | "revokedAt">): Promise<ApiKeyRecord>;
  findApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null>;
  listApiKeys(tenantId: string): Promise<ApiKeyRecord[]>;
  revokeApiKey(tenantId: string, keyId: string): Promise<ApiKeyRecord | null>;

  recordUsage(event: Omit<UsageEvent, "createdAt">): Promise<void>;
  usageSummary(tenantId: string, month: string): Promise<UsageSummaryRow[]>;

  appendAudit(record: Omit<AuditRecord, "createdAt">): Promise<void>;
  getAudit(tenantId: string, requestId: string): Promise<AuditRecord | null>;

  getIdempotency(tenantId: string, key: string): Promise<IdempotencyRecord | null>;
  saveIdempotency(record: Omit<IdempotencyRecord, "createdAt">): Promise<void>;

  createWebhookEndpoint(input: Omit<WebhookEndpoint, "id" | "createdAt" | "disabledAt">): Promise<WebhookEndpoint>;
  listWebhookEndpoints(tenantId: string): Promise<WebhookEndpoint[]>;
  disableWebhookEndpoint(tenantId: string, id: string): Promise<boolean>;
  listWebhookDeliveries(tenantId: string, endpointId: string, limit: number): Promise<WebhookDelivery[]>;

  /** System-level (cross-tenant), used only by the event emitter and delivery worker. */
  systemListWebhookEndpoints(event: WebhookEvent): Promise<WebhookEndpoint[]>;
  systemGetWebhookEndpoint(id: string): Promise<WebhookEndpoint | null>;
  createWebhookDelivery(input: Omit<WebhookDelivery, "id" | "createdAt" | "deliveredAt" | "attempts" | "lastStatusCode" | "lastError" | "status">): Promise<WebhookDelivery>;
  /** Atomically claims due pending deliveries by pushing nextAttemptAt out by leaseMs. */
  claimDueWebhookDeliveries(now: Date, limit: number, leaseMs: number): Promise<WebhookDelivery[]>;
  updateWebhookDelivery(id: string, patch: Partial<Pick<WebhookDelivery, "status" | "attempts" | "lastStatusCode" | "lastError" | "nextAttemptAt" | "deliveredAt">>): Promise<void>;
}

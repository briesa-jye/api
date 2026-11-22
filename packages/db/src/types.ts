export type KeyMode = "test" | "live";

export interface Tenant {
  id: string;
  name: string;
  retentionDays: number;
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
  createTenant(input: { name: string; retentionDays?: number }): Promise<Tenant>;
  getTenant(tenantId: string): Promise<Tenant | null>;

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

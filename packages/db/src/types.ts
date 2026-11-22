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
}

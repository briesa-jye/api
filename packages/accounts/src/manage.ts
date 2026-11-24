import type { ApiKeyRecord, KeyKind, KeyMode, NewApiKey, Store, WebhookEndpoint } from "@briesa/db";
import { WEBHOOK_EVENTS } from "@briesa/db";
import { z } from "zod";
import { liveAccessAllowed } from "./billing.ts";
import { generateKey, hasPackAccess, normalizeOrigin, PUBLISHABLE_SCOPE } from "./keys.ts";
import { newSecret } from "./sign.ts";
import { checkUrlShape, UnsafeUrlError } from "./ssrf.ts";

/** Business-rule failure. The API maps it to its error format; the dashboard shows the message. */
export class ManageError extends Error {
  readonly type: "invalid_request_error" | "permission_error" | "not_found_error";
  readonly code: string;
  readonly status: number;
  constructor(type: ManageError["type"], code: string, message: string, status?: number) {
    super(message);
    this.type = type; this.code = code;
    this.status = status ?? (type === "invalid_request_error" ? 400 : type === "permission_error" ? 403 : 404);
  }
}

export interface Actor { tenantId: string; scopes: string[] }

const SCOPE = /^(\*|assess|read|audit:read|keys:manage|webhooks|pack:[a-z0-9-]+|pack:\*)$/;
const ORIGINS = z.array(z.string().min(1).max(200)).min(1).max(20);

export const createKeyInput = z.strictObject({
  name: z.string().min(1).max(100),
  mode: z.enum(["test", "live"]),
  scopes: z.array(z.string().regex(SCOPE)).min(1),
  rate_limit_per_minute: z.number().int().min(1).max(10_000).optional(),
  /** "publishable" makes a key that is safe in a browser widget. Defaults to "secret". */
  kind: z.enum(["secret", "publishable"]).optional(),
  /** Publishable keys only, and required for them. */
  allowed_origins: ORIGINS.optional(),
  /** Billable calls per calendar month. Publishable keys get a default cap; secret keys have none unless set. */
  monthly_cap: z.number().int().min(1).max(10_000_000).optional(),
});
export type CreateKeyInput = z.infer<typeof createKeyInput>;

export const updateKeyInput = z.strictObject({
  name: z.string().min(1).max(100).optional(),
  allowed_origins: ORIGINS.optional(),
  /** null removes the cap. */
  monthly_cap: z.number().int().min(1).max(10_000_000).nullable().optional(),
  rate_limit_per_minute: z.number().int().min(1).max(10_000).optional(),
}).refine((v) => Object.keys(v).length > 0, "Provide at least one field to change.");
export type UpdateKeyInput = z.infer<typeof updateKeyInput>;

/** Defaults that keep a leaked publishable key from becoming an open-ended bill. */
export const PUBLISHABLE_DEFAULTS = { rateLimitPerMinute: 30, maxRateLimitPerMinute: 600, monthlyCap: { test: 500, live: 5_000 } } as const;

export const createWebhookInput = z.strictObject({
  url: z.string().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  packs: z.array(z.string().min(1)).min(1).max(50).optional(),
});
export type CreateWebhookInput = z.infer<typeof createWebhookInput>;

export const zodMessage = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");

/** A key can only mint keys whose scopes it already holds. */
export function assertScopeSubset(granted: string[], requested: string[]) {
  if (granted.includes("*")) return;
  for (const s of requested) {
    const ok = granted.includes(s) || (s.startsWith("pack:") && granted.includes("pack:*"));
    if (!ok) throw new ManageError("permission_error", "scope_escalation", `Cannot grant scope '${s}'.`);
  }
}

async function assertLiveAllowed(store: Store, tenantId: string, mode: KeyMode) {
  if (mode !== "live") return;
  const t = await store.getTenant(tenantId);
  if (!t || !liveAccessAllowed(t)) throw new ManageError("permission_error", "subscription_required", "Live keys need an active subscription. Test keys are free.", 402);
}

async function insertKey(store: Store, base: Omit<NewApiKey, "prefix" | "hash" | "publicKey">) {
  const kind: KeyKind = base.kind ?? "secret";
  for (let attempt = 0; ; attempt++) {
    const g = generateKey(base.mode, kind);
    try { return { record: await store.createApiKey({ ...base, prefix: g.prefix, hash: g.hash, publicKey: kind === "publishable" ? g.key : null }), key: g.key }; }
    catch (e) { if (attempt >= 2) throw e; } // a prefix collision is astronomically unlikely; retry
  }
}

/** Validates and normalises the origins of a publishable key. Throws ManageError naming the first bad one. */
function cleanOrigins(origins: string[], mode: KeyMode): string[] {
  const out: string[] = [];
  for (const raw of origins) {
    const o = normalizeOrigin(raw, mode);
    if (!o) {
      throw new ManageError("invalid_request_error", "invalid_origin",
        `'${raw}' is not an allowed origin. Use https://example.com or https://*.example.com (no path); http://localhost is for test keys only.`);
    }
    if (!out.includes(o)) out.push(o);
  }
  return out;
}

/** The plaintext key is returned once for secret keys; a publishable key can also be shown again from the dashboard. */
export async function createKey(store: Store, actor: Actor, input: CreateKeyInput) {
  assertScopeSubset(actor.scopes, input.scopes);
  await assertLiveAllowed(store, actor.tenantId, input.mode);
  const kind: KeyKind = input.kind ?? "secret";
  if (kind === "secret") {
    if (input.allowed_origins) throw new ManageError("invalid_request_error", "origins_need_publishable", "allowed_origins only applies to publishable keys.");
    return insertKey(store, { tenantId: actor.tenantId, name: input.name, mode: input.mode, scopes: input.scopes, rateLimitPerMinute: input.rate_limit_per_minute ?? 60, rotatedFromId: null, kind, monthlyCap: input.monthly_cap ?? null });
  }
  const bad = input.scopes.find((s) => !PUBLISHABLE_SCOPE.test(s));
  if (bad) throw new ManageError("invalid_request_error", "invalid_publishable_scope", `A publishable key cannot hold the '${bad}' scope. Allowed: assess, read, and pack:<id> for named packs.`);
  if (!input.scopes.includes("assess") || !input.scopes.some((s) => s.startsWith("pack:"))) {
    throw new ManageError("invalid_request_error", "invalid_publishable_scope", "A publishable key needs the 'assess' scope and at least one named pack (pack:<id>).");
  }
  if (!input.allowed_origins) throw new ManageError("invalid_request_error", "origins_required", "A publishable key needs at least one allowed origin.");
  const limit = input.rate_limit_per_minute ?? PUBLISHABLE_DEFAULTS.rateLimitPerMinute;
  if (limit > PUBLISHABLE_DEFAULTS.maxRateLimitPerMinute) throw new ManageError("invalid_request_error", "rate_limit_too_high", `A publishable key's rate limit cannot exceed ${PUBLISHABLE_DEFAULTS.maxRateLimitPerMinute} per minute.`);
  return insertKey(store, {
    tenantId: actor.tenantId, name: input.name, mode: input.mode, scopes: input.scopes, rateLimitPerMinute: limit, rotatedFromId: null,
    kind, allowedOrigins: cleanOrigins(input.allowed_origins, input.mode), monthlyCap: input.monthly_cap ?? PUBLISHABLE_DEFAULTS.monthlyCap[input.mode],
  });
}

export async function rotateKey(store: Store, tenantId: string, keyId: string) {
  const old = (await store.listApiKeys(tenantId)).find((k) => k.id === keyId);
  if (!old || old.revokedAt) throw new ManageError("not_found_error", "key_not_found", "No active key with that id.");
  await assertLiveAllowed(store, tenantId, old.mode);
  const made = await insertKey(store, {
    tenantId, name: old.name, mode: old.mode, scopes: old.scopes, rateLimitPerMinute: old.rateLimitPerMinute, rotatedFromId: old.id,
    kind: old.kind, allowedOrigins: old.allowedOrigins, monthlyCap: old.monthlyCap,
  });
  await store.revokeApiKey(tenantId, old.id);
  return made;
}

/** Changes a key's name, allowed origins, cap or rate limit. Scopes, mode and kind never change: create a new key for that. */
export async function updateKey(store: Store, tenantId: string, keyId: string, input: UpdateKeyInput) {
  const cur = (await store.listApiKeys(tenantId)).find((k) => k.id === keyId);
  if (!cur || cur.revokedAt) throw new ManageError("not_found_error", "key_not_found", "No active key with that id.");
  if (input.allowed_origins && cur.kind !== "publishable") throw new ManageError("invalid_request_error", "origins_need_publishable", "allowed_origins only applies to publishable keys.");
  if (cur.kind === "publishable" && input.rate_limit_per_minute !== undefined && input.rate_limit_per_minute > PUBLISHABLE_DEFAULTS.maxRateLimitPerMinute) {
    throw new ManageError("invalid_request_error", "rate_limit_too_high", `A publishable key's rate limit cannot exceed ${PUBLISHABLE_DEFAULTS.maxRateLimitPerMinute} per minute.`);
  }
  if (cur.kind === "publishable" && input.monthly_cap === null) throw new ManageError("invalid_request_error", "cap_required", "A publishable key must keep a monthly cap.");
  const rec = await store.updateApiKey(tenantId, keyId, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.allowed_origins && { allowedOrigins: cleanOrigins(input.allowed_origins, cur.mode) }),
    ...(input.monthly_cap !== undefined && { monthlyCap: input.monthly_cap }),
    ...(input.rate_limit_per_minute !== undefined && { rateLimitPerMinute: input.rate_limit_per_minute }),
  });
  if (!rec) throw new ManageError("not_found_error", "key_not_found", "No active key with that id.");
  return rec;
}

export async function revokeKey(store: Store, tenantId: string, keyId: string) {
  const rec = await store.revokeApiKey(tenantId, keyId);
  if (!rec) throw new ManageError("not_found_error", "key_not_found", "No key with that id.");
  return rec;
}

/** The signing secret is returned once. `packExists` lets the caller supply its own pack registry. */
export async function createWebhook(store: Store, actor: Actor, input: CreateWebhookInput, packExists: (id: string) => boolean): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  try { checkUrlShape(input.url); } catch (e) {
    if (e instanceof UnsafeUrlError) throw new ManageError("invalid_request_error", "invalid_webhook_url", e.message);
    throw e;
  }
  const allPacks = actor.scopes.includes("pack:*") || actor.scopes.includes("*");
  const want = input.packs ?? (allPacks ? ["*"] : null);
  if (!want) throw new ManageError("invalid_request_error", "packs_required", "List the pack ids this endpoint should receive events for.");
  for (const id of want) {
    if (id === "*" ? !allPacks : !packExists(id) || !hasPackAccess(actor.scopes, id)) throw new ManageError("not_found_error", "pack_not_found", `No such pack: ${id}.`);
  }
  const secret = newSecret();
  return { endpoint: await store.createWebhookEndpoint({ tenantId: actor.tenantId, url: input.url, events: input.events, packs: want, secret }), secret };
}

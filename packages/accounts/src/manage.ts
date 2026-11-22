import type { ApiKeyRecord, KeyMode, Store, WebhookEndpoint } from "@briesa/db";
import { WEBHOOK_EVENTS } from "@briesa/db";
import { z } from "zod";
import { liveAccessAllowed } from "./billing.ts";
import { generateKey, hasPackAccess } from "./keys.ts";
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

export const createKeyInput = z.strictObject({
  name: z.string().min(1).max(100),
  mode: z.enum(["test", "live"]),
  scopes: z.array(z.string().regex(/^(\*|assess|read|audit:read|keys:manage|webhooks|pack:[a-z0-9-]+|pack:\*)$/)).min(1),
  rate_limit_per_minute: z.number().int().min(1).max(10_000).optional(),
});
export type CreateKeyInput = z.infer<typeof createKeyInput>;

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

async function insertKey(store: Store, base: Omit<ApiKeyRecord, "id" | "createdAt" | "revokedAt" | "prefix" | "hash">) {
  for (let attempt = 0; ; attempt++) {
    const g = generateKey(base.mode);
    try { return { record: await store.createApiKey({ ...base, prefix: g.prefix, hash: g.hash }), key: g.key }; }
    catch (e) { if (attempt >= 2) throw e; } // a prefix collision is astronomically unlikely; retry
  }
}

/** The plaintext key is returned once and never stored. */
export async function createKey(store: Store, actor: Actor, input: CreateKeyInput) {
  assertScopeSubset(actor.scopes, input.scopes);
  await assertLiveAllowed(store, actor.tenantId, input.mode);
  return insertKey(store, { tenantId: actor.tenantId, name: input.name, mode: input.mode, scopes: input.scopes, rateLimitPerMinute: input.rate_limit_per_minute ?? 60, rotatedFromId: null });
}

export async function rotateKey(store: Store, tenantId: string, keyId: string) {
  const old = (await store.listApiKeys(tenantId)).find((k) => k.id === keyId);
  if (!old || old.revokedAt) throw new ManageError("not_found_error", "key_not_found", "No active key with that id.");
  await assertLiveAllowed(store, tenantId, old.mode);
  const made = await insertKey(store, { tenantId, name: old.name, mode: old.mode, scopes: old.scopes, rateLimitPerMinute: old.rateLimitPerMinute, rotatedFromId: old.id });
  await store.revokeApiKey(tenantId, old.id);
  return made;
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

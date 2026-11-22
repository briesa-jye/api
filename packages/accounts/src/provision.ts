import type { KeyMode, Store } from "@briesa/db";
import { generateKey } from "./keys.ts";

export interface ProvisionOptions {
  name: string;
  /** Pack ids the tenant is licensed for, or "all" for every pack. */
  packs: string[] | "all";
  retentionDays?: number;
  /** Provisioned by Briesa (design partner, enterprise, internal): live keys work without a Stripe subscription. Default true. */
  billingExempt?: boolean;
  /** Extra scopes beyond the standard customer set. */
  rateLimitPerMinute?: number;
}

export const STANDARD_SCOPES = ["assess", "read", "audit:read", "webhooks", "keys:manage"];

/** Creates a tenant with one test key and one live key. Plaintext keys are returned once and never stored. */
export async function provisionTenant(store: Store, o: ProvisionOptions) {
  if (!o.name.trim()) throw new Error("name is required");
  if (o.packs !== "all" && (!o.packs.length || o.packs.some((p) => !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(p)))) throw new Error("packs must be pack ids or 'all'");
  const scopes = [...STANDARD_SCOPES, ...(o.packs === "all" ? ["pack:*"] : o.packs.map((p) => `pack:${p}`))];
  const tenant = await store.createTenant({ name: o.name.trim(), retentionDays: o.retentionDays, billingExempt: o.billingExempt ?? true });
  const keys: Record<KeyMode, string> = { test: "", live: "" };
  for (const mode of ["test", "live"] as const) {
    for (let attempt = 0; ; attempt++) {
      const g = generateKey(mode);
      try {
        await store.createApiKey({ tenantId: tenant.id, name: `${mode} (provisioned)`, prefix: g.prefix, hash: g.hash, mode, scopes, rateLimitPerMinute: o.rateLimitPerMinute ?? 60, rotatedFromId: null });
        keys[mode] = g.key;
        break;
      } catch (e) {
        if (attempt >= 2) throw e; // prefix collision is astronomically unlikely; retry a couple of times
      }
    }
  }
  return { tenant, keys, scopes };
}

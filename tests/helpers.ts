import { MemoryStore } from "@briesa/db";
import type { KeyMode } from "@briesa/db";
import { buildApp } from "../apps/api/src/app.ts";
import { ApiError } from "../apps/api/src/errors.ts";
import { generateKey, hasPackAccess } from "../apps/api/src/keys.ts";

export async function setup() {
  const store = new MemoryStore();
  const app = await buildApp({ store });
  // Test-only route proving idempotency, metering and per-pack scoping without any industry code.
  let calls = 0;
  app.post("/v1/_echo", { config: { scope: "assess", billable: "echo" } }, async (req) => {
    calls++;
    const packId = (req.body as { pack?: string } | null)?.pack;
    if (packId) {
      if (!hasPackAccess(req.auth!.scopes, packId)) {
        throw new ApiError("permission_error", "pack_not_licensed", "Pack not licensed.");
      }
      req.packId = packId;
    }
    return { n: calls };
  });
  const mint = async (tenantId: string, scopes: string[], mode: KeyMode = "live", rate = 60) => {
    const g = generateKey(mode);
    await store.createApiKey({
      tenantId, name: "t", prefix: g.prefix, hash: g.hash, mode, scopes,
      rateLimitPerMinute: rate, rotatedFromId: null,
    });
    return g.key;
  };
  const tenantA = await store.createTenant({ name: "A" });
  const tenantB = await store.createTenant({ name: "B" });
  const auth = (key: string, extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${key}`, ...extra,
  });
  return { app, store, mint, tenantA, tenantB, auth, calls: () => calls };
}

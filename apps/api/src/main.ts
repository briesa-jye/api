import { resolve } from "node:path";
import { AnthropicClient } from "@briesa/ai";
import { MemoryStore, type Store } from "@briesa/db";
import { createPrismaClient, PrismaStore } from "@briesa/db/prisma";
import { parseSecretKey } from "@briesa/db/secretbox";
import { PackRegistry } from "@briesa/packs";
import { buildApp } from "./app.ts";
import { StoreRateLimiter } from "./ratelimit.ts";
import { provisionTenant } from "./provision.ts";
import { startRetentionJob } from "./retention.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production: the in-memory store loses everything on restart.");
}

const prisma = databaseUrl ? createPrismaClient(databaseUrl) : null;
const secretKey = process.env.WEBHOOK_SECRET_KEY ? parseSecretKey(process.env.WEBHOOK_SECRET_KEY) : null;
if (prisma && !secretKey && process.env.NODE_ENV === "production") {
  console.warn("WEBHOOK_SECRET_KEY is not set: webhook signing secrets are stored unencrypted.");
}
const prismaStore = prisma ? new PrismaStore(prisma, { secretKey }) : null;
const store: Store = prismaStore ?? new MemoryStore();
const packsDir = resolve(import.meta.dirname, "../../../packs");
const app = await buildApp({
  store, logger: true,
  // RATE_LIMIT_STORE=database shares limits across instances (needs migration 0007). Default: per-process memory.
  rateLimiter: process.env.RATE_LIMIT_STORE === "database" ? new StoreRateLimiter(store) : undefined,
  testMonthlyCap: process.env.TEST_MONTHLY_CAP ? Number(process.env.TEST_MONTHLY_CAP) : undefined, packs: PackRegistry.fromDir(packsDir), packsDir,
  clientIpHeader: process.env.CLIENT_IP_HEADER || undefined,
  ai: process.env.ANTHROPIC_API_KEY ? new AnthropicClient(process.env.ANTHROPIC_API_KEY) : undefined,
});
if (prismaStore && secretKey) {
  const n = await prismaStore.encryptLegacySecrets();
  if (n) app.log.info({ count: n }, "encrypted existing webhook secrets");
}
app.webhooks.start();
if (prisma) startRetentionJob(store, app.log);
process.on("SIGHUP", () =>
  app.reloadPacks().then((r) => app.log.info(r, "packs reloaded"))
    .catch((e) => app.log.error({ err: { name: e.name } }, "pack reload failed; keeping old packs")));
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { void app.close().then(() => prisma?.$disconnect()).finally(() => process.exit(0)); });
}

// Local development without a database: throwaway tenant, keys printed once to the console (not the logger).
if (!prisma) {
  const dev = await provisionTenant(store, { name: "dev", packs: "all", rateLimitPerMinute: 600 });
  console.log(`dev test key: ${dev.keys.test}`);
  console.log(`dev live key: ${dev.keys.live}`);
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });

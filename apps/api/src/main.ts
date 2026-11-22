import { resolve } from "node:path";
import { AnthropicClient } from "@briesa/ai";
import { MemoryStore, type Store } from "@briesa/db";
import { createPrismaClient, PrismaStore } from "@briesa/db/prisma";
import { PackRegistry } from "@briesa/packs";
import { buildApp } from "./app.ts";
import { provisionTenant } from "./provision.ts";
import { startRetentionJob } from "./retention.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production: the in-memory store loses everything on restart.");
}

const prisma = databaseUrl ? createPrismaClient(databaseUrl) : null;
const store: Store = prisma ? new PrismaStore(prisma) : new MemoryStore();
const packsDir = resolve(import.meta.dirname, "../../../packs");
const app = await buildApp({
  store, logger: true, packs: PackRegistry.fromDir(packsDir), packsDir,
  ai: process.env.ANTHROPIC_API_KEY ? new AnthropicClient(process.env.ANTHROPIC_API_KEY) : undefined,
});
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

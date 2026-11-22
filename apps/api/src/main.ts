import { resolve } from "node:path";
import { AnthropicClient } from "@briesa/ai";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { buildApp } from "./app.ts";
import { generateKey } from "./keys.ts";

// The Prisma-backed store is not built yet, so the only store is in memory and loses everything on restart.
// Refuse to run it in production rather than silently dropping tenants, audit records and billing data.
if (process.env.NODE_ENV === "production") {
  throw new Error("No persistent store is implemented yet (see DECISIONS.md). Refusing to start in production.");
}

const store = new MemoryStore();
const packsDir = resolve(import.meta.dirname, "../../../packs");
const app = await buildApp({
  store, logger: true, packs: PackRegistry.fromDir(packsDir), packsDir,
  ai: process.env.ANTHROPIC_API_KEY ? new AnthropicClient(process.env.ANTHROPIC_API_KEY) : undefined,
});
app.webhooks.start();
process.on("SIGHUP", () =>
  app.reloadPacks().then((r) => app.log.info(r, "packs reloaded"))
    .catch((e) => app.log.error({ err: { name: e.name } }, "pack reload failed; keeping old packs")));

// Local development: create a throwaway tenant and print its keys once to the console (not to the logger).
const tenant = await store.createTenant({ name: "dev" });
for (const mode of ["test", "live"] as const) {
  const k = generateKey(mode);
  await store.createApiKey({ tenantId: tenant.id, name: `dev ${mode}`, prefix: k.prefix, hash: k.hash, mode, scopes: ["*"], rateLimitPerMinute: 600, rotatedFromId: null });
  console.log(`dev ${mode} key: ${k.key}`);
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });

import { MemoryStore } from "@briesa/db";
import { resolve } from "node:path";
import { PackRegistry } from "@briesa/packs";
import { AnthropicClient } from "@briesa/ai";
import { buildApp } from "./app.ts";

// Phase 1: in-memory store. The Prisma-backed store is wired in once a database is provisioned.
const packsDir = resolve(import.meta.dirname, "../../../packs");
const app = await buildApp({ store: new MemoryStore(), logger: true, packs: PackRegistry.fromDir(packsDir), packsDir, ai: process.env.ANTHROPIC_API_KEY ? new AnthropicClient(process.env.ANTHROPIC_API_KEY) : undefined });
app.webhooks.start();
process.on("SIGHUP", () => app.reloadPacks().then((r) => app.log.info(r, "packs reloaded")).catch((e) => app.log.error({ err: { name: e.name } }, "pack reload failed; keeping old packs")));
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });

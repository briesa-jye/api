import { MemoryStore } from "@briesa/db";
import { buildApp } from "./app.ts";

// Phase 1: in-memory store. The Prisma-backed store is wired in once a database is provisioned.
const app = await buildApp({ store: new MemoryStore(), logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });

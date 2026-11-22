import "server-only";
import { MemoryStore, type Store } from "@briesa/db";
import { createPrismaClient, PrismaStore } from "@briesa/db/prisma";

const g = globalThis as unknown as { __briesaStore?: Store };

/** One store per server instance. Postgres when DATABASE_URL is set; in-memory only for local development. */
export function getStore(): Store {
  if (g.__briesaStore) return g.__briesaStore;
  const url = process.env.DATABASE_URL;
  if (!url && process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");
  g.__briesaStore = url ? new PrismaStore(createPrismaClient(url)) : new MemoryStore();
  return g.__briesaStore;
}

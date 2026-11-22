import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaClient } from "@prisma/client";
import { MemoryStore, type Store } from "@briesa/db";
import { PrismaStore } from "@briesa/db/prisma";
import { PrismaPGlite } from "pglite-prisma-adapter";

const migrations = resolve(import.meta.dirname, "../packages/db/prisma/migrations");

/** A real (in-process, WASM) Postgres with the project's actual migration SQL applied in order. */
export async function makePrismaStore() {
  const pg = new PGlite();
  for (const dir of readdirSync(migrations).filter((d) => /^\d{4}_/.test(d)).sort()) {
    await pg.exec(readFileSync(join(migrations, dir, "migration.sql"), "utf8"));
  }
  const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  const store = new PrismaStore(client);
  return { store, pg, client, close: async () => { await client.$disconnect(); await pg.close(); } };
}

export const storeFactories: { name: string; make: () => Promise<{ store: Store; close: () => Promise<void> }> }[] = [
  { name: "MemoryStore", make: async () => ({ store: new MemoryStore(), close: async () => {} }) },
  { name: "PrismaStore (Postgres via PGlite)", make: makePrismaStore },
];

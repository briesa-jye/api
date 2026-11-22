import { createPrismaClient, PrismaStore } from "../packages/db/src/prisma-index.ts";
import { provisionTenant } from "../apps/api/src/provision.ts";

const args = process.argv.slice(2);
const get = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const name = get("--name");
const packs = get("--packs");
const url = process.env.DATABASE_URL;
if (!url || !name || !packs) {
  console.error('usage: DATABASE_URL=... pnpm tenant:create --name "Acme Pty Ltd" --packs real-estate-aml,whs-incident-notification|all [--retention-days 365]');
  process.exit(2);
}
const client = createPrismaClient(url);
try {
  const r = await provisionTenant(new PrismaStore(client), {
    name, packs: packs === "all" ? "all" : packs.split(",").map((p) => p.trim()),
    retentionDays: get("--retention-days") ? Number(get("--retention-days")) : undefined,
  });
  console.log(`Tenant ${r.tenant.id} (${r.tenant.name}), retention ${r.tenant.retentionDays} days`);
  console.log(`Scopes: ${r.scopes.join(", ")}`);
  console.log("Keys are shown once. Store them now:");
  console.log(`  test: ${r.keys.test}`);
  console.log(`  live: ${r.keys.live}`);
} finally { await client.$disconnect(); }

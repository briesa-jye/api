# Decisions

Defaults chosen by the build, as agreed with Jye. Change any of these before production.

| Area | Default | Why / status |
|---|---|---|
| Web framework | Fastify 5 | Hooks for auth, idempotency and metering; long-lived process suits BullMQ later. |
| Hosting | Node service, not Vercel | Webhook retries and workers need a persistent process. Not yet provisioned. |
| Region | Sydney (ap-southeast-2) for DB and host | Australian data residency. **To confirm before launch.** |
| Retention | 365 days per tenant (`Tenant.retentionDays`); store inputs hash + output, never raw inputs unless the tenant opts in | Privacy by design. **To confirm.** |
| Package scope | `@briesa/*`, repo `api` | |
| API keys | `bk_<test\|live>_<prefix>_<secret>`; only prefix + SHA-256 stored; constant-time compare | Keys are high-entropy so a fast hash is appropriate. |
| Scopes | `assess`, `read`, `audit:read`, `keys:manage`, `webhooks`, `pack:<id>`, `pack:*`, `*` | A key cannot mint scopes it lacks. |
| Rate limiting | Fixed window per key, in-memory | Swap `RateLimiter` for a Redis implementation before running >1 instance. |
| Idempotency | Stored per tenant + key with request hash; key-minting routes opt out because responses contain secrets | |
| Pricing / licence tiers | Not decided | Pack `licence tier` will be an unused field until you decide. |

## Phase 1 limitations
- `MemoryStore` backs the running server; `prisma/schema.prisma` is written and validates but there is no `PrismaStore` yet and no migration has been run (needs a database).
- There is no way yet to create the first tenant and key outside tests (needs the Prisma store plus a provisioning script).

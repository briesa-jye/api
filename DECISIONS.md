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

## Phase 2 decisions
- **Rule conditions** are a closed JSON/YAML vocabulary (`all/any/not` plus 11 comparison ops). No expressions, no `eval`.
- **Outcome aggregation**: highest outcome of any matched rule, using the order declared per scenario type in `pack.yaml`.
- **`needs_review` and retired rules never affect an outcome.** Matching `needs_review` rules are surfaced as `rules_pending_review` and force `human_review_recommended`.
- **`human_review_recommended`** is true unless the pack is `verified`, nothing escalated and no unapplied rule matched.
- **Evaluation date** is the current date in Australia/Sydney.
- **Output schemas** are not per-pack; the response shape is fixed by the platform (only the outcome vocabulary is pack-defined).
- Unlicensed packs return 404, not 403, so pack ids aren't enumerable.
- Packs load once at startup; `rules.updated` / `pack.updated` webhooks and hot reload come with webhooks.

## Phase 6 decisions (website, accounts, billing)
- **Hosting split:** the website and dashboard (`apps/web`, Next.js) deploy to Vercel at api.briesa.com; the API (`apps/api`) runs on its own Sydney Node host at a separate hostname. The dashboard talks to the same Postgres directly through shared code in `packages/accounts`, not through the API.
- **Free sandbox, paid live:** test keys always work (all packs, not billed). Live keys need `billingExempt` or a subscription in `active`, `trialing` or `past_due` (past_due allowed while Stripe retries). Otherwise the API returns **402 `subscription_required`**.
- **Plans license packs:** `Tenant.licensedPacks` (`["*"]` = all) is intersected with a live key's pack scopes on every request, so a plan change applies to existing keys within about 10 seconds (the tenant cache). Test keys ignore licensing.
- **Billing-exempt tenants** are those created by `pnpm tenant:create` (design partners, internal) unless `--require-subscription` is passed. Self-serve sign-ups are not exempt.
- Self-serve tenants are created on first sign-in with one owner (`TenantMember`, Supabase Auth user id). One tenant per user for now; no team invites.
- Key and webhook management rules live in `@briesa/accounts/manage`, used by both the API routes and the dashboard, so they cannot drift.
- No prices are hard-coded anywhere. Plans come from Stripe prices configured by environment variable.

## Phase 5 decisions (persistence)
- `PrismaStore` (Postgres via `@prisma/adapter-pg`) implements the same `Store` contract as `MemoryStore`. One contract test suite runs against both; the Prisma side runs on **PGlite** (real Postgres compiled to WASM) using the project's actual migration SQL. It has **not** been run against a hosted Postgres or through the production `pg` driver, and `prisma migrate deploy` has not been run (no database was available).
- Migrations: `0001_init` is generated from the schema; `0002_audit_immutability` is hand-written. A trigger makes `AuditRecord` immutable: UPDATE is always rejected and DELETE is rejected unless the transaction sets `briesa.retention = 'on'`, which only the retention job and tenant erasure do. This holds even against raw SQL.
- Foreign keys tie every tenant-owned table to `Tenant` (restrict on delete).
- Retention: audit records are purged per tenant `retentionDays` (default 365), idempotency records after 24 h, finished webhook deliveries after 30 days; runs hourly when a database is configured. `eraseTenantData` removes a tenant's audit, idempotency and delivery rows but keeps keys, endpoints and usage counts (billing). Full tenant deletion is not implemented.
- Webhook delivery claiming uses `FOR UPDATE SKIP LOCKED` with a 5-minute lease, so several workers can run safely.
- Raw SQL timestamps are explicit about UTC, so a non-UTC database session cannot shift retention or retry times (tested).
- Provisioning: `pnpm tenant:create --name ... --packs a,b|all` creates a tenant with one test and one live key (standard scopes plus pack scopes) and prints them once. There is no HTTP admin API for creating tenants; that is deliberate for now.
- With `DATABASE_URL` unset the server uses the in-memory store with a dev tenant, and still refuses to start when `NODE_ENV=production`.

## Phase 4 decisions
- **Webhook delivery uses a database-backed outbox with a polling worker, not BullMQ.** Deliveries are rows with `nextAttemptAt`; a worker claims due rows with a lease. It survives restarts, needs no Redis, and is simpler to reason about at this scale. This deviates from the plan; BullMQ can replace the poller later without changing the API. Redis is still needed for a multi-instance rate limiter.
- Retry schedule: 1 min, 5 min, 30 min, 2 h, 12 h (6 attempts), 10 s timeout, redirects not followed, destination re-resolved at send time to block private addresses (SSRF).
- Webhook signing secrets are stored in plaintext (they must be recoverable to sign). Encrypt at rest before production (noted in the Prisma schema).
- Webhook events carry outcome metadata only, never raw inputs. Pack events (`pack.updated`, `rules.updated`) go only to tenants that still hold a live key with access to that pack.
- Packs reload on `SIGHUP` (or `app.reloadPacks()`); an invalid reload keeps the old packs live and emits nothing.
- **AI notes are opt-in per request (`options.ai_notes`).** Only booleans, numbers and enum values described by the pack's input schema are sent to the model; free text is never sent. Output must match a strict JSON schema, and items that read as a regulatory decision or direction to lodge/notify are dropped. On any failure the response is the deterministic result with `ai_assisted_notes: null`.
- Claude Haiku is wired as a named model constant but **no endpoint uses it yet**; "interpret messy inputs" (free-text to structured fields) is not built.
- The AI client and prompt were tested with fake model clients only. Nothing was sent to a real model in this phase.
- The server **refuses to start with `NODE_ENV=production`** because the only store is in memory. In development it prints throwaway keys at startup.
- The OpenAPI document is built from the same Zod schemas the routes validate with; tests assert it is valid 3.1, covers every route and scope, and that `docs/` is regenerated (`pnpm docs:generate`).
- Idempotent replays are not metered.

## Phase 3 decisions
- Both real packs are `draft` with no reviewer, not `beta`: they were compiled from regulator guidance pages by the build, with no human expert review. Only `verified` is production-ready.
- Pack rules cite regulator guidance pages (AUSTRAC, Safe Work Australia) with retrieval dates, not the legislation text, which could not be read in this session. See `RULES_TO_VERIFY.md`.
- Where a statutory test is not encoded (serious injury list, dangerous incident list, whether a real estate activity is a designated service), the pack takes the caller's answer as an input and escalates when it is `unknown`. It never guesses.
- `real-estate-aml` outcome `hold_pending_cdd` is the highest outcome: required initial CDD matters are not yet established, so the service must not start (subject to delayed CDD, not encoded). The reasons list still shows any enhanced-CDD triggers.
- Rules are effective from 2026-07-01 (AUSTRAC's stated commencement). Assessments dated earlier return `not_in_scope`.
- `whs-incident-notification` applies model-based rules to ACT, NSW, NT, QLD, SA, TAS and WA; Victoria returns `needs_information` and a pointer to WorkSafe Victoria. Commonwealth (Comcare) workplaces are not covered because the platform has no Commonwealth jurisdiction code.
- Rule files may use YAML anchors to share a condition between rules in one file.

## Phase 1 limitations
- Superseded in phase 5: a `PrismaStore` and migrations now exist (see above).
- Superseded in phase 5: `pnpm tenant:create` provisions tenants.

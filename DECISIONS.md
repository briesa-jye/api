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
- `MemoryStore` backs the running server; `prisma/schema.prisma` is written and validates but there is no `PrismaStore` yet and no migration has been run (needs a database).
- Tenants and keys can only be created by the dev bootstrap in `apps/api/src/main.ts` or in tests (needs the Prisma store plus a provisioning script).

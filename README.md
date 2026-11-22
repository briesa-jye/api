# Briesa Compliance API

Horizontal compliance decision-support API. Industries are data "packs"; the platform knows nothing about any industry.

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm typecheck
corepack pnpm pack:new <industry>
corepack pnpm pack:validate <pack>
```

- `packages/engine`: pure rules engine (no I/O, no industry knowledge)
- `packages/packs`: pack loader, validator, registry, scaffolder, diffing
- `packages/ai`: redaction, prompts, guardrails and fallback for optional AI-assisted notes
- `apps/api`: Fastify HTTP API (`/v1/packs`, `/v1/assess`, `/v1/rules`, `/v1/obligations`, `/v1/audit`, `/v1/keys`, `/v1/usage`)
- `packs/`: the packs themselves
- `docs/pack-authoring.md`: how to add or change rules

Docs: [quickstart](docs/quickstart.md), [API reference](docs/reference.md), [OpenAPI 3.1](docs/openapi.json), [versioning policy](docs/versioning.md), [pack authoring](docs/pack-authoring.md).

## Running with a database

```bash
export DATABASE_URL=postgresql://user:password@host:5432/briesa_api   # a Sydney-region instance is recommended
corepack pnpm db:migrate                                              # prisma migrate deploy
corepack pnpm tenant:create --name "Acme Pty Ltd" --packs real-estate-aml,whs-incident-notification
NODE_ENV=production corepack pnpm --filter @briesa/api start
```

Without `DATABASE_URL` the server runs in memory for local development (and refuses to start in production). `ANTHROPIC_API_KEY` enables optional AI-assisted notes. `kill -HUP <pid>` reloads packs.

Status: phase 5 (persistence). Phases 1 to 4: platform, engine and pack tooling, two draft packs, webhooks, AI-assist, OpenAPI. (webhooks, AI-assist layer, OpenAPI). Both real packs are `draft`. See `DECISIONS.md` and `RULES_TO_VERIFY.md`.

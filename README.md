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

Status: phase 4 (webhooks, AI-assist layer, OpenAPI). Both real packs are `draft`. See `DECISIONS.md` and `RULES_TO_VERIFY.md`.

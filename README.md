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
- `packages/packs`: pack loader, validator, registry, scaffolder
- `apps/api`: Fastify HTTP API (`/v1/packs`, `/v1/assess`, `/v1/rules`, `/v1/obligations`, `/v1/audit`, `/v1/keys`, `/v1/usage`)
- `packs/`: the packs themselves
- `docs/pack-authoring.md`: how to add or change rules

Status: phase 2 (engine and pack tooling). See `DECISIONS.md`.

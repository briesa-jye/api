# Briesa API website and dashboard

Next.js 16 app for api.briesa.com, in Briesa's own theme (tokens, Manrope and IBM Plex Mono, logo and base components copied from briesa.com). Marketing pages, docs, the pack catalogue, sign-up and sign-in (Supabase Auth), the customer dashboard, and Stripe billing.

| Area | Route |
| --- | --- |
| Marketing, pricing, packs | `/`, `/pricing`, `/packs`, `/packs/[id]` (static) |
| Docs | `/docs`, `/docs/quickstart` and the other repo `docs/*.md` files, `/docs/openapi.json` |
| Auth | `/signup`, `/login`, `/auth/callback` |
| Dashboard (signed in, dynamic) | `/dashboard`, `/keys`, `/webhooks`, `/usage`, `/audit`, `/billing` |
| Stripe | `POST /api/stripe/webhook` |

The dashboard talks to the same Postgres as the API through the shared `@briesa/accounts` and `@briesa/db` packages. It does not call the API. Customers' software calls the API directly on its own host.

## Run it locally

```bash
corepack pnpm install
cd apps/web
DEMO_AUTH=1 corepack pnpm dev          # http://localhost:3000
```

`DEMO_AUTH=1` signs in a fake user and seeds an in-memory tenant so every dashboard page can be seen without Supabase, Stripe or a database. It is ignored when `NODE_ENV=production`.

## Environment

See `.env.example`. Without `DATABASE_URL` the in-memory store is used (development only). Without Supabase variables sign-in shows "not configured" and the dashboard stays closed. Without Stripe variables pricing shows "Pricing is being finalised" and Subscribe is disabled.

## Plans

Plans are configuration, not code: set `BRIESA_PLANS` (see `.env.example`) after creating prices in Stripe. A plan lists the packs it licenses; changes apply to existing live keys within seconds. No prices are stored in this repo.

## Deploying

See `docs/deploy.md` at the repo root.

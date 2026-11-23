# Deploying

Two deployments share one Postgres database.

| Part | Where | Why |
| --- | --- | --- |
| Website and dashboard (`apps/web`) | Vercel, `syd1` | Next.js; static marketing pages, dynamic dashboard |
| API (`apps/api`) | A Node host in Sydney (Fly.io, Railway or Render) | Long-running process: webhook worker and retention job run in it |
| Database | Postgres in Sydney (e.g. Supabase) | Shared by both |

## 1. Database

1. Create the project in the Sydney region. Use the **session pooler** connection string (port 5432).
2. In Supabase, turn **off** the Data API for the project, or enable row-level security on every table with no policies. Prisma creates tables in `public`, which Supabase otherwise exposes over its HTTP API.
3. Apply the migrations from your machine:

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
corepack pnpm db:migrate
```

4. Optionally create a Briesa-provisioned tenant (design partner or internal; exempt from Stripe):

```bash
corepack pnpm tenant:create --name "Briesa internal" --packs all
```

## 2. API on a Node host

A `Dockerfile` is at the repo root (not yet built or run in this repo's CI: check it on first deploy).

Environment:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (the server refuses to start in production without `DATABASE_URL`) |
| `DATABASE_URL` | the same Postgres |
| `PORT` | provided by the host |
| `ANTHROPIC_API_KEY` | optional; enables AI-assisted notes |

### Fly.io (Sydney)

`fly.toml` is in the repo root. One machine only (the rate limiter is per-instance memory) and it must stay running (webhook worker, retention job).

```bash
brew install flyctl && fly auth login
fly launch --copy-config --no-deploy        # pick your own unique app name
fly secrets set DATABASE_URL='postgresql://...'   # optional: ANTHROPIC_API_KEY
fly scale count 1 --region syd
fly deploy
```

The app is then at `https://<app>.fly.dev`; check `https://<app>.fly.dev/health`. Add a custom hostname with `fly certs add gateway.briesa.com` and the DNS records it prints.

Give it a hostname such as `gateway.briesa.com` and put that in the website's `NEXT_PUBLIC_API_BASE_URL`. Health check path: `/health`. Run one instance until the rate limiter moves to Redis (it is per-instance memory).

## 3. Website on Vercel

1. Import the repository. **Root Directory: `apps/web`**. Framework: Next.js. Keep "Include source files outside of the Root Directory" enabled: the app reads `packs/` and `docs/` from the repo root.
2. Environment variables: everything in `apps/web/.env.example` (Production). `DEMO_AUTH` must not be set.
3. Add the domain `api.briesa.com`.
4. Region is fixed to `syd1` by `apps/web/vercel.json`.

## 4. Supabase Auth

In Authentication, URL configuration: set the **Site URL** to `https://api.briesa.com` and add `https://api.briesa.com/auth/callback` to the redirect allow-list. Decide whether email confirmation is required (recommended: yes). Set the minimum password length to at least 10 to match the form.

## 5. Stripe

1. Create a Product and one or more recurring Prices. Prices and currency stay in Stripe.
2. Set `BRIESA_PLANS` to map each price to the packs it licenses.
3. Add a webhook endpoint `https://api.briesa.com/api/stripe/webhook` for: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Enable the customer portal (Settings, Billing, Customer portal) so Manage billing works.
5. Test in Stripe test mode end to end before switching to live keys.

## What has and has not been exercised

Exercised here: the migrations on Postgres (PGlite), the API and store contract, Stripe event handling and webhook signature checks with synthetic events, and the website running locally in demo mode.

Not exercised: a real Supabase project, a real Stripe account (checkout, portal, live webhooks), Vercel's build and runtime (file tracing of `packs/` and the Prisma client), the Dockerfile, and the production `pg` driver.

# Briesa Compliance API reference

Version 0.1.0. Generated from `docs/openapi.json`: do not edit by hand (`pnpm docs:generate`).

Decision support, not legal advice. Every assessment is produced by versioned, sourced rules and returns reasons with rule ids, versions, sources and effective dates. AI is optional, labelled, and never makes a regulatory decision. Check each response's `pack.status`: only `verified` packs are production-ready. See the versioning and deprecation policy in the docs.

All requests use `Authorization: Bearer <key>`. Errors have the shape `{ "error": { "type", "code", "message", "request_id" } }`.

## Meta

### `GET /health`

**Health check**

Public (no key needed).

Responses: `200`

### `GET /ready`

**Readiness check**

200 while the database answers within 2 seconds, otherwise 503. Use for load balancers and uptime monitors; `/health` only says the process is up.

Public (no key needed).

Responses: `200`

### `GET /v1/openapi.json`

**This OpenAPI document**

Public (no key needed).

Responses: `200`

## Packs

### `GET /v1/packs`

**List packs available to your key**

Required scope: `read`

Responses: `200`, `401`, `402`, `403`, `429`

### `GET /v1/packs/{id}`

**Get a pack with its scenario types and input schemas**

Required scope: `read`

| Parameter | In | Required | Description |
|---|---|---|---|
| `id` | path | yes | Pack id |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

## Assessments

### `POST /v1/assess`

**Run an assessment**

Validates `inputs` against the pack's schema for `scenario_type`, runs the pack's versioned rules, and returns an explainable result. Decision support only: every response carries a disclaimer and a `human_review_recommended` flag, and the result always includes the pack's maturity status. Billable on live keys.

Required scope: `assess`

| Parameter | In | Required | Description |
|---|---|---|---|
| `Idempotency-Key` | header | no | Repeating a request with the same key and body returns the original response (header `Idempotent-Replayed: true`). Keys are per tenant. |

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `pack` | string | yes |  |
| `scenario_type` | string | yes |  |
| `jurisdiction` | `AU` \| `ACT` \| `NSW` \| `NT` \| `QLD` \| `SA` \| `TAS` \| `VIC` \| `WA` | yes |  |
| `inputs` | object | yes |  |
| `as_of` | string | no |  |
| `reference` | string | no |  |
| `options` | object | no |  |

Responses: `200`, `400`, `401`, `402`, `403`, `404`, `409`, `429`

## Rules

### `GET /v1/rules`

**List rule definitions**

Required scope: `read`

| Parameter | In | Required | Description |
|---|---|---|---|
| `pack` | query | no | Limit to one pack |
| `status` | query | no | active, needs_review or retired |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

### `GET /v1/rules/{id}`

**Get all versions of a rule**

Required scope: `read`

| Parameter | In | Required | Description |
|---|---|---|---|
| `id` | path | yes | Rule id |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

## Obligations

### `GET /v1/obligations`

**List obligations in force**

Obligations with source references, effective dates and deadlines. Defaults to today's date in Australia/Sydney.

Required scope: `read`

| Parameter | In | Required | Description |
|---|---|---|---|
| `pack` | query | no | Limit to one pack |
| `activity` | query | no | Entity type or activity tag, e.g. pcbu |
| `jurisdiction` | query | no | ACT, NSW, NT, QLD, SA, TAS, VIC or WA |
| `as_of` | query | no | YYYY-MM-DD |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

## Audit

### `GET /v1/audit`

**List audit records, newest first**

Cursor-paginated. Pass `next_cursor` back as `starting_after` for the next page. Filter by `pack`, your own `reference`, or `test`.

Required scope: `audit:read`

| Parameter | In | Required | Description |
|---|---|---|---|
| `limit` | query | no | 1 to 100, default 25 |
| `starting_after` | query | no | Cursor from a previous page |
| `pack` | query | no | Pack id |
| `reference` | query | no | Exact match on the reference you sent to /v1/assess |
| `test` | query | no | true or false |

Responses: `200`, `400`, `401`, `402`, `403`, `429`

### `GET /v1/audit/{request_id}`

**Get the stored audit record for a past call**

Required scope: `audit:read`

| Parameter | In | Required | Description |
|---|---|---|---|
| `request_id` | path | yes | The request_id returned by the original call |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

## Usage

### `GET /v1/usage`

**Billable usage for a month**

Required scope: `read`

| Parameter | In | Required | Description |
|---|---|---|---|
| `month` | query | no | YYYY-MM, defaults to the current month |

Responses: `200`, `400`, `401`, `402`, `403`, `429`

## API keys

### `GET /v1/keys`

**List API keys**

Required scope: `keys:manage`

Responses: `200`, `401`, `402`, `403`, `429`

### `POST /v1/keys`

**Create an API key**

A secret key (the default) is returned once and cannot be retrieved again. Set `kind` to `publishable` for a key that is safe to put in a browser widget: it needs `allowed_origins`, can only hold `assess`, `read` and named `pack:<id>` scopes, can only run assessments and read pack details, and has a rate limit and a monthly cap (defaults 30 per minute; 500 test or 5,000 live calls a month). A key can only grant scopes it holds itself.

Required scope: `keys:manage`

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `mode` | `test` \| `live` | yes |  |
| `scopes` | array | yes |  |
| `rate_limit_per_minute` | integer | no |  |
| `kind` | `secret` \| `publishable` | no |  |
| `allowed_origins` | array | no |  |
| `monthly_cap` | integer | no |  |

Responses: `201`, `400`, `401`, `402`, `403`, `429`

### `PATCH /v1/keys/{id}`

**Change a key's settings**

Change the name, allowed origins, monthly cap or rate limit of an active key. Scopes, mode and kind cannot change: create a new key for that. A publishable key must keep a monthly cap.

Required scope: `keys:manage`

| Parameter | In | Required | Description |
|---|---|---|---|
| `id` | path | yes | Key id |

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | no |  |
| `allowed_origins` | array | no |  |
| `monthly_cap` | any | no |  |
| `rate_limit_per_minute` | integer | no |  |

Responses: `200`, `400`, `401`, `402`, `403`, `404`, `429`

### `POST /v1/keys/{id}/rotate`

**Rotate a key**

Creates a replacement with the same scopes and mode and revokes the old key immediately.

Required scope: `keys:manage`

| Parameter | In | Required | Description |
|---|---|---|---|
| `id` | path | yes | Key id |

Responses: `201`, `401`, `402`, `403`, `404`, `429`

### `POST /v1/keys/{id}/revoke`

**Revoke a key**

Required scope: `keys:manage`

| Parameter | In | Required | Description |
|---|---|---|---|
| `id` | path | yes | Key id |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

## Webhooks

### `GET /v1/webhooks`

**List webhook endpoints**

Required scope: `webhooks`

Responses: `200`, `401`, `402`, `403`, `429`

### `POST /v1/webhooks`

**Register a webhook endpoint**

The signing secret is returned once. URLs must be https and publicly reachable. Deliveries are signed (see the `webhooks` section) and retried with backoff.

Required scope: `webhooks`

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes |  |
| `events` | array | yes |  |
| `packs` | array | no |  |

Responses: `201`, `400`, `401`, `402`, `403`, `404`, `429`

### `DELETE /v1/webhooks/{id}`

**Delete a webhook endpoint**

Pending deliveries to it are cancelled.

Required scope: `webhooks`

| Parameter | In | Required | Description |
|---|---|---|---|
| `id` | path | yes | Webhook id |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

### `GET /v1/webhooks/{id}/deliveries`

**Delivery log for a webhook (latest 50)**

Required scope: `webhooks`

| Parameter | In | Required | Description |
|---|---|---|---|
| `id` | path | yes | Webhook id |

Responses: `200`, `401`, `402`, `403`, `404`, `429`

## Webhook events

### `assessment.completed`

Sent to your endpoint. Verify the `Briesa-Signature` header (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with your endpoint secret) and reject timestamps older than 5 minutes. Respond 2xx within 10 seconds; anything else is retried after 1 min, 5 min, 30 min, 2 h and 12 h (6 attempts in total). Redirects are not followed. Events never contain raw assessment inputs.

### `rules.updated`

Sent to your endpoint. Verify the `Briesa-Signature` header (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with your endpoint secret) and reject timestamps older than 5 minutes. Respond 2xx within 10 seconds; anything else is retried after 1 min, 5 min, 30 min, 2 h and 12 h (6 attempts in total). Redirects are not followed. Events never contain raw assessment inputs.

### `pack.updated`

Sent to your endpoint. Verify the `Briesa-Signature` header (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with your endpoint secret) and reject timestamps older than 5 minutes. Respond 2xx within 10 seconds; anything else is retried after 1 min, 5 min, 30 min, 2 h and 12 h (6 attempts in total). Redirects are not followed. Events never contain raw assessment inputs.


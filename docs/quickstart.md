# Quickstart

Get a key, make a first assessment, and get notified when rules change. About five minutes.

> **Status:** both shipped real packs (`real-estate-aml`, `whs-incident-notification`) are `draft`: useful for integration, **not** production-ready. Every response tells you the pack status.

## 1. Get a test key

Create an account at the Briesa API website and open **Dashboard, API keys**. Create a **test** key. Test keys are free, need no card, run the same logic as live keys, and every response carries `test_mode: true`. The key is shown once, so copy it straight away.

```bash
export BRIESA_KEY=bk_test_...
export BRIESA_URL=<the API base URL shown on your dashboard overview>
```

Live keys need an active subscription. Until you subscribe, a live key returns `402 subscription_required`.

## 2. See what packs you can use

```bash
curl -s $BRIESA_URL/v1/packs -H "Authorization: Bearer $BRIESA_KEY"
```

Each pack has a `status` (`draft`, `beta`, `verified`), a `version`, the jurisdictions it covers, and (via `GET /v1/packs/{id}`) the JSON Schema for each scenario type's `inputs`.

## 3. Make your first assessment

A work-related death in NSW, against the `whs-incident-notification` pack:

```bash
curl -s $BRIESA_URL/v1/assess \
  -H "Authorization: Bearer $BRIESA_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "pack": "whs-incident-notification",
    "scenario_type": "classify_incident",
    "jurisdiction": "NSW",
    "inputs": { "incident_type": "death", "arose_from_work": true }
  }'
```

The same call in TypeScript:

```ts
const res = await fetch(`${process.env.BRIESA_URL}/v1/assess`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.BRIESA_KEY}`,
    "content-type": "application/json",
    "idempotency-key": crypto.randomUUID(),
  },
  body: JSON.stringify({
    pack: "whs-incident-notification",
    scenario_type: "classify_incident",
    jurisdiction: "NSW",
    inputs: { incident_type: "death", arose_from_work: true },
  }),
});
const result = await res.json();
if (!res.ok) throw new Error(`${result.error.code}: ${result.error.message} (${result.error.request_id})`);
console.log(result.outcome, result.required_actions.map((a: { id: string }) => a.id));
```

You get back `outcome`, `required_actions`, `missing_information`, `escalation_recommended`, and `reasons[]`: each reason names the rule (`rule_id`, `rule_version`), the source (`instrument`, `section`, `url`) and its effective date. Also:

- `pack` `{ id, version, status }`: how much to rely on it.
- `human_review_recommended`: true for anything short of a `verified` pack, any escalation, or any unapplied `needs_review` rule that matched.
- `disclaimer`: decision support, not legal advice. Show it to your users.
- `rules_pending_review`: rules that matched but are not yet verified. They are never applied to the outcome.
- `request_id`: use it with `GET /v1/audit/{request_id}` to fetch the stored audit record.

**You decide, not the API.** The result tells you what the rules say about the facts you supplied. A qualified person must review it and make any notification, lodgement or compliance decision.

### Optional: AI-assisted notes

Add `"options": { "ai_notes": true }`. If the server has a model configured (`ANTHROPIC_API_KEY`), you get `ai_assisted_notes` (labelled, with observations, edge cases and questions for the reviewer). It never changes the outcome. Only schema-constrained values (booleans, numbers, enums) are sent to the model, never free text. If the model fails or times out you simply get `ai_assisted_notes: null` and an `ai_status` explaining why.

## 4. Handle errors

Every error has the same shape:

```json
{ "error": { "type": "invalid_request_error", "code": "invalid_inputs", "message": "...", "request_id": "req_..." } }
```

Quote `request_id` when contacting support. `429` responses include `Retry-After`. Retrying a `POST` with the same `Idempotency-Key` and body returns the original response (`Idempotent-Replayed: true`); the same key with a different body is a `409` (`idempotency_key_reused`). If the first request with that key is still running, a retry gets `409 request_in_progress` with `Retry-After: 1`; wait and retry. A `5xx` releases the key, so retrying after a server error runs the request again.

## Dates, references and the audit trail

- `as_of` (`YYYY-MM-DD`, optional) on `POST /v1/assess` answers "what did the rules say on this date?" using each rule's effective dates. The response echoes `as_of`. It uses the pack version currently deployed, so for a date before a rule existed you get that rule's absence, not an earlier wording; the audit record keeps the exact rule versions used.
- `reference` (optional, up to 200 characters) is your own identifier for the assessment. It is stored in the audit record and returned. Use an internal id, never personal information.
- `GET /v1/audit` lists audit records newest first (`limit` 1 to 100, `starting_after` cursor from `next_cursor`, filters `pack`, `reference`, `test`).

## 5. Get notified when rules change

```bash
curl -s $BRIESA_URL/v1/webhooks \
  -H "Authorization: Bearer $BRIESA_KEY" -H "Content-Type: application/json" \
  -d '{ "url": "https://your-app.example/briesa-webhook", "events": ["rules.updated", "pack.updated"] }'
```

The response includes a signing `secret` **once**. Events: `assessment.completed`, `rules.updated`, `pack.updated`. Verify every delivery before trusting it:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret: string, rawBody: string, header: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest();
  const got = Buffer.from(parts.v1 ?? "", "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
```

Respond `2xx` within 10 seconds. Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours (6 attempts in total); `GET /v1/webhooks/{id}/deliveries` shows the log. Webhook URLs must be `https` and publicly reachable, and redirects are not followed. Events never contain raw assessment inputs.

## 6. Use the API from a web page

Never put a secret key (`bk_...`) in a web page, an app or a public repository: anyone who opens the page can copy it. Requests that carry an `Origin` header (that is, every request from a browser) are refused for secret keys with `secret_key_in_browser`.

For a widget, create a **publishable key** (`pk_test_...` or `pk_live_...`) in the dashboard under API keys, or with `POST /v1/keys` and `"kind": "publishable"`. It is safe to put in a page because it is deliberately limited:

- It only works from the sites you list in `allowed_origins`: `https://www.example.com`, or `https://*.example.com` for subdomains. A request from any other site gets `origin_not_allowed`, and a request with no `Origin` gets `origin_required`. (Test keys may also list `http://localhost:3000`.)
- It can only hold the `assess`, `read` and named `pack:<id>` scopes, never a wildcard, and can only reach `POST /v1/assess`, `GET /v1/packs` and `GET /v1/packs/{id}` (the questions for a pack). Everything else returns `not_available_to_publishable_keys`.
- It cannot request `options.ai_notes` (`ai_notes_not_available`), because each one costs a model call. Ask for those from your server.
- It has a monthly cap on billable calls (default 500 for test keys, 5,000 for live keys), after which calls return `429` with `monthly_cap_reached`, and a rate limit that is also split per visitor, so one visitor cannot use up the whole allowance.

The API sends the CORS headers a browser needs, so `fetch` works with no proxy:

```js
const res = await fetch("https://briesa-api.fly.dev/v1/assess", {
  method: "POST",
  headers: { Authorization: "Bearer pk_live_...", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "NSW", inputs: { incident_type: "death", arose_from_work: true } }),
});
const assessment = await res.json();
```

A publishable key is not a secret, but treat the results with the same care as any decision support: show the pack's `status` and the `human_review_recommended` notice, and never present a result as a guarantee of compliance. Assessments never store the raw inputs, only a hash.

## Next

- Full reference: [reference.md](reference.md) and [openapi.json](openapi.json) (also served at `/v1/openapi.json`)
- Typed client for Node and browsers: [sdk.md](sdk.md)
- Widgets for your own site: [widgets.md](widgets.md)
- Versioning and deprecation: [versioning.md](versioning.md)
- Adding or changing rules: [pack-authoring.md](pack-authoring.md)

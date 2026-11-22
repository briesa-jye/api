# Quickstart

Get a key, make a first assessment, and get notified when rules change. About five minutes.

> **Status:** this is a development build with no hosted environment. Without `DATABASE_URL` the server keeps everything in memory and prints throwaway `test` and `live` keys when it starts; with a database, create a tenant and keys using `pnpm tenant:create` (see the README). Both shipped real packs (`real-estate-aml`, `whs-incident-notification`) are `draft`: useful for integration, **not** production-ready. Every response tells you the pack status.

## 1. Run it

```bash
corepack pnpm install
corepack pnpm dev
```

The server prints two keys, for example `dev test key: bk_test_…`. Use the **test** key: it runs the same logic, is not billed, and responses carry `test_mode: true`.

```bash
export BRIESA_KEY=bk_test_...
export BRIESA_URL=http://localhost:3000
```

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

Quote `request_id` when contacting support. `429` responses include `Retry-After`. Retrying a `POST` with the same `Idempotency-Key` and body returns the original response (`Idempotent-Replayed: true`); the same key with a different body is a `409`.

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

## Next

- Full reference: [reference.md](reference.md) and [openapi.json](openapi.json) (also served at `/v1/openapi.json`)
- Versioning and deprecation: [versioning.md](versioning.md)
- Adding or changing rules: [pack-authoring.md](pack-authoring.md)

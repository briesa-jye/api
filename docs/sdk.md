# TypeScript SDK

`@briesa/sdk` is a typed client for the API. It has no dependencies and uses only standard `fetch` and Web Crypto. It is tested on Node and against a browser-like environment; Deno, Bun and edge runtimes provide the same standard APIs, so it should run there too, but they are not part of the test suite.

> **Pre-release (0.1.0).** The SDK is built and tested but is not on npm yet. Until it is, build it from the repository with `corepack pnpm sdk:build` and install the `packages/sdk` folder. The API itself is stable and the SDK only wraps it, so nothing here changes what you can do with plain HTTP.

```ts
import { Briesa } from "@briesa/sdk";

const briesa = new Briesa({ apiKey: process.env.BRIESA_API_KEY });

const result = await briesa.assess({
  pack: "whs-incident-notification",
  scenario_type: "classify_incident",
  jurisdiction: "NSW",
  inputs: { incident_type: "death", arose_from_work: true },
});

result.outcome;                   // "notifiable"
result.required_actions;          // what to do, each with the rule it came from
result.reasons;                   // the rules behind it, with legal sources
result.human_review_recommended;  // always show this to the person who acts on the result
```

Names match the API exactly (`scenario_type`, `as_of`, `ai_notes`), so the [API reference](reference.md) applies to the SDK one to one. Requests and results are typed from the same OpenAPI document that produces the reference, and a test fails if they ever differ. A wrong request is a compile error:

```ts
briesa.assess({ pack: "x", scenario_type: "y", jurisdiction: "XX", inputs: {} });
//                                              ~~~~~~~~~~~~~~~~ not a jurisdiction
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `apiKey` | `BRIESA_API_KEY` | A secret key (`bk_...`) on a server, or a publishable key (`pk_...`) in a browser. |
| `baseUrl` | the production API (`BRIESA_BASE_URL` if set) | Where requests go. |
| `timeoutMs` | 30000 | Per attempt. |
| `maxRetries` | 2 | Retries after the first attempt, only for failures that are safe to repeat (see below). |
| `retryBaseMs` | 500 | First retry delay. Later ones double, with jitter. |
| `maxRetryDelayMs` | 30000 | The longest wait accepted, including a server's `Retry-After`. Beyond it the error is thrown. |
| `fetch` | global `fetch` | Your own, for a proxy or a test double. |
| `onResponse` | none | Called after every response with the status, request id, attempt number and headers (never bodies). Use it for metrics. |
| `dangerouslyAllowBrowser` | false | See [Browsers](#browsers). |

Every call also takes `{ signal, timeoutMs, maxRetries, idempotencyKey }`: `await briesa.packs.list({ signal: controller.signal })`.

## What you can call

```ts
briesa.assess(params)                          // POST /v1/assess
briesa.packs.list()  briesa.packs.get(id)      // pack metadata, and the questions (input_schema) for each scenario
briesa.rules.list({ pack })  briesa.rules.get(id)
briesa.obligations.list({ pack, jurisdiction, as_of })
briesa.audit.list({ pack, reference, test })  briesa.audit.get(requestId)
briesa.usage.get({ month })
briesa.keys.list() / create() / update(id) / rotate(id) / revoke(id)
briesa.webhooks.list() / create() / delete(id) / deliveries(id)
```

`briesa.mode` (`"test"` or `"live"`) and `briesa.keyKind` (`"secret"` or `"publishable"`) are read from the key, so you can log which you are using.

## Retries and idempotency

`assess` sends an `Idempotency-Key` on every call: yours if you pass `{ idempotencyKey }`, otherwise one the SDK generates. The same key is reused on every automatic retry, so a request that was processed but whose response was lost is replayed, never run or billed twice.

The SDK retries a failed request when repeating it is safe:

- **Reads, deletes and updates, and `assess`:** connection errors, timeouts, `5xx`, `409 request_in_progress`, and `429 rate_limited` (waiting for `Retry-After`).
- **Creating or rotating keys, and creating webhooks:** only `429 rate_limited`, which the API refuses before doing anything. After a timeout or `5xx` they are **not** repeated, because the first attempt may have succeeded and a second would create a duplicate. Check `briesa.keys.list()` before trying again.
- **Never:** `monthly_cap_reached` (it will not clear in seconds) and any `4xx` other than the above.

## Errors

Everything the SDK throws extends `BriesaError`. Errors from the API extend `APIError` and carry the stable `code` and the `requestId` to quote to support.

| Class | When | Useful fields |
|---|---|---|
| `InvalidRequestError` | 400: the request was rejected | `code`, `message` |
| `AuthenticationError` | 401: missing, invalid or revoked key | |
| `SubscriptionRequiredError` | 402: live keys need a subscription | |
| `PermissionError` | 403: a missing scope or pack, or for a publishable key a refused origin or route | `code` (`missing_scope`, `origin_not_allowed`, ...) |
| `NotFoundError` | 404: including packs you are not licensed for | |
| `IdempotencyError` | 409: a reused key with a different request, or one still running | `code` |
| `RateLimitError` | 429 | `retryAfterSeconds`; `code` is `rate_limited` or `monthly_cap_reached` |
| `InternalServerError` | 5xx | |
| `ConnectionError`, `TimeoutError` | no response arrived | `cause` |
| `AbortedError` | your `AbortSignal` fired | |

```ts
import { RateLimitError, PermissionError } from "@briesa/sdk";

try {
  await briesa.assess(params);
} catch (e) {
  if (e instanceof RateLimitError && e.code === "monthly_cap_reached") { /* tell the operator to raise the cap */ }
  else if (e instanceof PermissionError) console.error(e.code, e.requestId);
  else throw e;
}
```

## Paging through the audit trail

`briesa.audit.list()` returns a page that is also an async iterable over every record on every page:

```ts
for await (const record of await briesa.audit.list({ pack: "whs-incident-notification" })) {
  console.log(record.request_id, record.output);
}
const firstHundred = await (await briesa.audit.list()).toArray({ limit: 100 });
```

For one page at a time use `page.data`, `page.hasMore` and `await page.nextPage()`.

## Receiving webhooks

`constructWebhookEvent` checks the signature and returns a typed event. Pass the body exactly as received, not re-serialised JSON:

```ts
import express from "express";
import { constructWebhookEvent, WebhookSignatureError } from "@briesa/sdk";

app.post("/briesa-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = await constructWebhookEvent(req.body, req.header("briesa-signature"), process.env.BRIESA_WEBHOOK_SECRET!);
    if (event.type === "assessment.completed") console.log(event.data.outcome); // typed
    res.sendStatus(200);
  } catch (e) {
    if (e instanceof WebhookSignatureError) return res.sendStatus(400);
    throw e;
  }
});
```

Signatures older or newer than five minutes are refused (`toleranceSeconds` changes that). Events never contain assessment inputs.

## Browsers

A secret key must never be used in a browser, because every visitor could read it. The SDK throws if it sees a `bk_` key in a browser, and so does the API. In a web page use a [publishable key](quickstart.md#6-use-the-api-from-a-web-page), which works from the sites you list:

```ts
const briesa = new Briesa({ apiKey: "pk_live_...", baseUrl: "https://YOUR-API" });
await briesa.assess(params);
```

The SDK sends only the headers the API's CORS rules allow (`Authorization`, `Content-Type`, `Idempotency-Key`), so no proxy is needed. For a ready-made form instead of code, see [widgets](widgets.md).

## Versions

The SDK follows [semantic versioning](versioning.md). Types come from the API's OpenAPI document, so a new field appears in a minor release and an incompatible API change only in a major one.

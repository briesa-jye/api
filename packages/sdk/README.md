# @briesa/sdk

TypeScript client for the Briesa Compliance API. No dependencies; uses only standard `fetch` and Web Crypto. Tested on Node and a browser-like environment (Deno, Bun and edge runtimes should work but are not tested).

```ts
import { Briesa } from "@briesa/sdk";

const briesa = new Briesa({ apiKey: process.env.BRIESA_API_KEY });
const result = await briesa.assess({
  pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "NSW",
  inputs: { incident_type: "death", arose_from_work: true },
});
console.log(result.outcome, result.human_review_recommended);
```

Typed requests and results, automatic and safe retries (an idempotency key on every assessment), specific error classes, async-iterable pagination, and webhook signature verification. Full guide: `docs/sdk.md` in the repository, or `/docs/sdk` on the site.

**Status: pre-release, not published.** Build with `corepack pnpm sdk:build` from the repository root. To publish, see the "TypeScript SDK" section of `DECISIONS.md`.

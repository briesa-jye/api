import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate } from "@scalar/openapi-parser";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { generateKey } from "../apps/api/src/keys.ts";
import { buildOpenApi } from "../apps/api/src/openapi.ts";
import { renderReference } from "../apps/api/src/reference.ts";
import { WebhookService } from "../apps/api/src/webhooks/service.ts";
import { makeWidgetPack } from "./packtools.ts";

const docs = (f: string) => readFileSync(resolve(import.meta.dirname, "../docs", f), "utf8");
const spec = buildOpenApi() as any;

describe("OpenAPI 3.1 document", () => {
  it("is valid OpenAPI 3.1", async () => {
    expect(spec.openapi).toBe("3.1.0");
    const r = await validate(spec);
    expect(r.errors ?? []).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("documents exactly the routes the app registers, with matching scopes", async () => {
    const { root } = makeWidgetPack();
    const app = await buildApp({ store: new MemoryStore(), packs: PackRegistry.fromDir(root) });
    await app.ready();
    const registered = new Map(app.routeTable.map((r) => [`${r.method} ${r.path}`, r.scope]));
    const documented = new Map<string, string | null>();
    for (const [path, ops] of Object.entries(spec.paths as Record<string, any>)) {
      for (const [method, op] of Object.entries(ops as Record<string, any>)) documented.set(`${method} ${path}`, op["x-required-scope"]);
    }
    const ignorable = (k: string) => k.endsWith("*"); // fastify wildcard/not-found
    expect([...registered.keys()].filter((k) => !ignorable(k) && !documented.has(k))).toEqual([]);
    expect([...documented.keys()].filter((k) => !registered.has(k))).toEqual([]);
    for (const [k, scope] of documented) expect(registered.get(k), k).toBe(scope);
    // A test-only route registered by other suites must not appear here: assert no stray underscore routes.
    expect([...registered.keys()].filter((k) => k.includes("/_"))).toEqual([]);
  });

  it("every authenticated operation lists the standard auth errors; public ones need no key", () => {
    for (const [path, ops] of Object.entries(spec.paths as Record<string, any>)) {
      for (const [m, op] of Object.entries(ops as Record<string, any>)) {
        if (op["x-required-scope"]) {
          expect(op.security, `${m} ${path}`).toEqual([{ bearerAuth: [] }]);
          for (const c of ["401", "402", "403", "429"]) expect(op.responses[c], `${m} ${path} ${c}`).toBeDefined();
        } else expect(op.security, `${m} ${path}`).toEqual([]);
      }
    }
  });

  it("assess request body is derived from the real validator and rejects unknown fields", () => {
    const body = spec.paths["/v1/assess"].post.requestBody.content["application/json"].schema;
    expect(body.additionalProperties).toBe(false);
    expect(body.required).toEqual(["pack", "scenario_type", "jurisdiction", "inputs"]);
    expect(body.properties.options.properties.ai_notes.type).toBe("boolean");
  });

  it("is served publicly at /v1/openapi.json", async () => {
    const app = await buildApp({ store: new MemoryStore() });
    const r = await app.inject("/v1/openapi.json");
    expect(r.statusCode).toBe(200);
    expect(r.json().openapi).toBe("3.1.0");
  });

  it("committed docs are up to date (run `pnpm docs:generate`)", () => {
    expect(JSON.parse(docs("openapi.json"))).toEqual(JSON.parse(JSON.stringify(buildOpenApi())));
    expect(docs("reference.md")).toBe(renderReference(buildOpenApi()));
  });
});

describe("documented webhook payloads match what is really sent", () => {
  it("assessment.completed data keys are all documented", async () => {
    const { root } = makeWidgetPack();
    const store = new MemoryStore();
    const bodies: any[] = [];
    const webhooks = new WebhookService(store, { fetch: (async (_u: string, i: RequestInit) => { bodies.push(JSON.parse(i.body as string)); return new Response(null); }) as unknown as typeof fetch, resolver: async () => ["93.184.216.34"] });
    const app = await buildApp({ store, packs: PackRegistry.fromDir(root), webhooks });
    const t = await store.createTenant({ name: "T", billingExempt: true });
    const g = generateKey("live");
    await store.createApiKey({ tenantId: t.id, name: "k", prefix: g.prefix, hash: g.hash, mode: "live", scopes: ["*"], rateLimitPerMinute: 100, rotatedFromId: null });
    const h = { authorization: `Bearer ${g.key}` };
    await app.inject({ method: "POST", url: "/v1/webhooks", headers: h, payload: { url: "https://example.com/h", events: ["assessment.completed"] } });
    await app.inject({ method: "POST", url: "/v1/assess", headers: h, payload: { pack: "widgets", scenario_type: "inspect", jurisdiction: "NSW", inputs: { count: 1 } } });
    await webhooks.runDue();
    const documented = Object.keys(spec.webhooks["assessment.completed"].post.requestBody.content["application/json"].schema.properties.data.properties);
    expect(Object.keys(bodies[0].data).sort()).toEqual(documented.sort());
    expect(Object.keys(bodies[0]).sort()).toEqual(["created", "data", "id", "livemode", "type"]);
  });
});

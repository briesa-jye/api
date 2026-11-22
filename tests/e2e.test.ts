import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { generateKey } from "../apps/api/src/keys.ts";
import { makeWidgetPack } from "./packtools.ts";

async function boot(scopes: string[] = ["assess", "read", "audit:read", "pack:*"], mode: "test" | "live" = "live", status = "beta") {
  const { root } = makeWidgetPack({ status });
  const store = new MemoryStore();
  const app = await buildApp({ store, packs: PackRegistry.fromDir(root) });
  const t = await store.createTenant({ name: "T" });
  const g = generateKey(mode);
  await store.createApiKey({ tenantId: t.id, name: "k", prefix: g.prefix, hash: g.hash, mode, scopes, rateLimitPerMinute: 1000, rotatedFromId: null });
  const h = { authorization: `Bearer ${g.key}` };
  const assess = (payload: unknown, headers = h) => app.inject({ method: "POST", url: "/v1/assess", headers, payload: payload as object });
  return { app, store, h, assess, t };
}
const valid = { pack: "widgets", scenario_type: "inspect", jurisdiction: "VIC", inputs: { count: 500, damaged: true } };

describe("a new pack works end to end with no engine or API changes", () => {
  it("assesses, with explainable reasons, pack status and disclaimer", async () => {
    const { assess } = await boot();
    const r = await assess(valid);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.outcome).toBe("urgent");
    expect(b.escalation_recommended).toBe(true);
    expect(b.required_actions.map((a: { id: string }) => a.id)).toEqual(["second-inspector"]);
    expect(b.missing_information.map((m: { path: string }) => m.path)).toEqual(["supplier"]);
    expect(b.reasons.map((x: { rule_id: string; rule_version: string; source: object; effective_from: string }) => [x.rule_id, x.rule_version, !!x.source, x.effective_from]))
      .toEqual([["damage-vic", "1.0.0", true, "2020-01-01"], ["large-batch", "1.0.0", true, "2020-01-01"]]);
    expect(b.pack).toEqual({ id: "widgets", version: "1.2.0", status: "beta" });
    expect(b.disclaimer).toMatch(/not legal advice/);
    expect(b.human_review_recommended).toBe(true);
    expect(b.test_mode).toBe(false);
    expect(b.request_id).toMatch(/^req_/);
    // The unsourced needs_review rule would have matched but must not drive the outcome.
    expect(b.rules_pending_review.map((x: { rule_id: string }) => x.rule_id)).toEqual(["unverified-thing"]);
  });
  it("jurisdiction-specific rules only apply in their jurisdiction", async () => {
    const { assess } = await boot();
    const b = (await assess({ ...valid, jurisdiction: "NSW" })).json();
    expect(b.outcome).toBe("review");
    expect(b.reasons.map((x: { rule_id: string }) => x.rule_id)).toEqual(["large-batch"]);
  });
  it("is flagged in test mode", async () => {
    const { assess } = await boot(undefined, "test");
    expect((await assess(valid)).json().test_mode).toBe(true);
  });
  it("human review is recommended unless the pack is verified, nothing escalated and no unapplied rule matched", async () => {
    const v = await boot(undefined, "live", "verified"); // fixture pack still has a needs_review rule
    const none = { ...valid, jurisdiction: "NSW", inputs: { count: 0 } }; // matches nothing
    expect((await v.assess(none)).json().human_review_recommended).toBe(false);
    expect((await v.assess({ ...none, inputs: { count: 1 } })).json().human_review_recommended).toBe(true); // pending rule matched
    expect((await v.assess(valid)).json().human_review_recommended).toBe(true); // escalation
    const beta = await boot();
    expect((await beta.assess(none)).json().human_review_recommended).toBe(true); // not verified
  });
  it("writes an immutable audit record without raw inputs, readable via /v1/audit", async () => {
    const { assess, app, h, store, t } = await boot();
    const b = (await assess(valid)).json();
    const rec = await store.getAudit(t.id, b.request_id);
    expect(rec?.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec?.packVersion).toBe("1.2.0");
    expect(rec?.ruleVersions).toEqual({ "damage-vic": "1.0.0", "large-batch": "1.0.0" });
    expect(JSON.stringify(rec)).not.toContain('"damaged"');
    const r = await app.inject({ url: `/v1/audit/${b.request_id}`, headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.json().output.outcome).toBe("urgent");
  });
  it("the inputs hash is stable regardless of key order", async () => {
    const { assess, store, t } = await boot();
    const a = (await assess({ ...valid, inputs: { count: 5, damaged: false } })).json();
    const b = (await assess({ ...valid, inputs: { damaged: false, count: 5 } })).json();
    expect((await store.getAudit(t.id, a.request_id))?.inputsHash).toBe((await store.getAudit(t.id, b.request_id))?.inputsHash);
  });
  it("validates inputs against the pack schema and rejects unknown fields", async () => {
    const { assess } = await boot();
    for (const inputs of [{}, { count: "5" }, { count: -1 }, { count: 1, surprise: true }]) {
      const r = await assess({ ...valid, inputs });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe("invalid_inputs");
    }
    expect((await assess({ ...valid, extra: 1 })).json().error.code).toBe("invalid_body");
    expect((await assess({ ...valid, scenario_type: "nope" })).json().error.code).toBe("unknown_scenario_type");
    expect((await assess({ ...valid, jurisdiction: "QLD" })).json().error.code).toBe("unsupported_jurisdiction");
  });
  it("hides packs the key is not licensed for", async () => {
    const { assess, app, h } = await boot(["assess", "read", "pack:other"]);
    expect((await assess(valid)).json().error.code).toBe("pack_not_found");
    expect((await app.inject({ url: "/v1/packs", headers: h })).json().packs).toEqual([]);
    expect((await app.inject({ url: "/v1/packs/widgets", headers: h })).statusCode).toBe(404);
    expect((await app.inject({ url: "/v1/rules?pack=widgets", headers: h })).statusCode).toBe(404);
  });
  it("meters billable assessments per pack", async () => {
    const { assess, app, h } = await boot();
    await assess(valid); await assess(valid);
    const u = (await app.inject({ url: "/v1/usage", headers: h })).json().usage;
    expect(u).toContainEqual({ packId: "widgets", endpoint: "assess", test: false, count: 2 });
  });
  it("lists packs, rules and obligations with sources and dates", async () => {
    const { app, h } = await boot();
    const p = (await app.inject({ url: "/v1/packs/widgets", headers: h })).json();
    expect(p.scenario_types.inspect.outcomes).toEqual(["ok", "review", "urgent"]);
    expect(p.scenario_types.inspect.input_schema.required).toEqual(["count"]);
    const rules = (await app.inject({ url: "/v1/rules?pack=widgets", headers: h })).json().rules;
    expect(rules.map((r: { id: string }) => r.id).sort()).toEqual(["damage-vic", "large-batch", "unverified-thing"]);
    expect((await app.inject({ url: "/v1/rules/large-batch", headers: h })).json().versions[0].source.instrument).toMatch(/Widget Act/);
    expect((await app.inject({ url: "/v1/rules/nope", headers: h })).statusCode).toBe(404);
    const o = (await app.inject({ url: "/v1/obligations?pack=widgets&activity=inspector&jurisdiction=NSW", headers: h })).json();
    expect(o.obligations.map((x: { id: string }) => x.id)).toEqual(["keep-records"]);
    expect((await app.inject({ url: "/v1/obligations?pack=widgets&activity=nobody", headers: h })).json().obligations).toEqual([]);
  });
});

describe("platform code is industry-agnostic", () => {
  const banned = /real[-_ ]?estate|\bwhs\b|\baml\b|austrac|cricos|afsl|construction|education|finance|workplace|incident|(?<![-\w])agent\b/i;
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
  it("engine, packs tooling and API source contain no industry terms", () => {
    const root = resolve(import.meta.dirname, "..");
    const files = [...walk(join(root, "packages/engine/src")), ...walk(join(root, "packages/packs/src")), ...walk(join(root, "apps/api/src"))];
    expect(files.length).toBeGreaterThan(10);
    const hits = files.flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => ({ f, i: i + 1, l })).filter((x) => banned.test(x.l)).map((x) => `${x.f}:${x.i}: ${x.l.trim()}`));
    expect(hits).toEqual([]);
  });
});

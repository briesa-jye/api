import { describe, expect, it } from "vitest";
import { assess, evaluate, ConditionSchema, RuleSchema, type Rule } from "@briesa/engine";

const rule = (over: Partial<Rule> & { id: string }): Rule => RuleSchema.parse({
  version: "1.0.0", title: "t", description: "d", jurisdictions: ["AU"],
  when: { path: "x", op: "exists" }, then: {}, status: "active", effective_from: "2020-01-01",
  source: { instrument: "Test instrument" }, ...over,
});
const outcome = { order: ["low", "medium", "high"], default: "low" };
const base = { outcome, scenarioType: "s", jurisdiction: "NSW", asOf: "2026-06-01" };

describe("conditions", () => {
  it("evaluates comparisons, combinators and nested paths", () => {
    const i = { a: { b: 5 }, tags: ["x", "y"], s: "hello" };
    expect(evaluate({ path: "a.b", op: "gte", value: 5 }, i)).toBe(true);
    expect(evaluate({ path: "a.b", op: "gt", value: 5 }, i)).toBe(false);
    expect(evaluate({ all: [{ path: "a.b", op: "lt", value: 9 }, { path: "tags", op: "contains", value: "y" }] }, i)).toBe(true);
    expect(evaluate({ any: [{ path: "s", op: "eq", value: "no" }, { path: "s", op: "in", value: ["hello"] }] }, i)).toBe(true);
    expect(evaluate({ not: { path: "s", op: "contains", value: "ell" } }, i)).toBe(false);
  });
  it("treats missing inputs as false for comparisons, never throws", () => {
    expect(evaluate({ path: "nope.deep", op: "gt", value: 1 }, {})).toBe(false);
    expect(evaluate({ path: "nope", op: "neq", value: 1 }, {})).toBe(false);
    expect(evaluate({ path: "nope", op: "missing" }, {})).toBe(true);
    expect(evaluate({ path: "a", op: "missing" }, { a: null })).toBe(true);
  });
  it("does not read prototype properties", () => {
    expect(evaluate({ path: "constructor", op: "exists" }, {})).toBe(false);
    expect(evaluate({ path: "__proto__.polluted", op: "exists" }, {})).toBe(false);
  });
  it("does not compare across types", () => {
    expect(evaluate({ path: "a", op: "gt", value: 1 }, { a: "5" })).toBe(false);
  });
  it("rejects code-like or malformed conditions at parse time", () => {
    expect(ConditionSchema.safeParse({ path: "a", op: "eval", value: "1+1" }).success).toBe(false);
    expect(ConditionSchema.safeParse({ path: "a b", op: "eq", value: 1 }).success).toBe(false);
    expect(ConditionSchema.safeParse({ path: "a", op: "in", value: 1 }).success).toBe(false);
    expect(ConditionSchema.safeParse({ path: "a", op: "exists", value: 1 }).success).toBe(false);
    expect(ConditionSchema.safeParse({ all: [] }).success).toBe(false);
    expect(ConditionSchema.safeParse({ path: "a", op: "eq", value: 1, extra: true }).success).toBe(false);
  });
});

describe("assess", () => {
  it("takes the highest matched outcome, merges and dedupes actions, ORs escalation", () => {
    const r = assess({ ...base, inputs: { x: 1 }, rules: [
      rule({ id: "r1", then: { outcome: "medium", required_actions: [{ id: "a1", description: "A" }] } }),
      rule({ id: "r2", then: { outcome: "high", escalate: true, required_actions: [{ id: "a1", description: "A" }, { id: "a2", description: "B" }] } }),
      rule({ id: "r3", then: { outcome: "low" } }),
    ] });
    expect(r.outcome).toBe("high");
    expect(r.required_actions.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(r.escalation_recommended).toBe(true);
    expect(r.reasons.map((x) => x.rule_id)).toEqual(["r1", "r2", "r3"]);
  });
  it("returns the default outcome when nothing matches", () => {
    const r = assess({ ...base, inputs: {}, rules: [rule({ id: "r1", then: { outcome: "high" } })] });
    expect(r.outcome).toBe("low");
    expect(r.reasons).toEqual([]);
  });
  it("every reason carries rule id, version, source and effective date", () => {
    const r = assess({ ...base, inputs: { x: 1 }, rules: [rule({ id: "r1", version: "2.1.0", then: { outcome: "high" } })] });
    expect(r.reasons[0]).toMatchObject({ rule_id: "r1", rule_version: "2.1.0", source: { instrument: "Test instrument" }, effective_from: "2020-01-01" });
  });
  it("respects effective dates (from inclusive, to exclusive)", () => {
    const rules = [rule({ id: "r1", effective_from: "2026-07-01", then: { outcome: "high" } }), rule({ id: "r2", effective_to: "2026-06-01", then: { outcome: "high" } })];
    expect(assess({ ...base, inputs: { x: 1 }, rules, asOf: "2026-06-30" }).outcome).toBe("low");
    expect(assess({ ...base, inputs: { x: 1 }, rules, asOf: "2026-07-01" }).outcome).toBe("high");
    expect(assess({ ...base, inputs: { x: 1 }, rules, asOf: "2026-05-31" }).outcome).toBe("high");
  });
  it("respects jurisdiction and scenario type; AU applies everywhere", () => {
    const rules = [rule({ id: "vic", jurisdictions: ["VIC"], then: { outcome: "high" } }), rule({ id: "typed", scenario_types: ["other"], then: { outcome: "high" } })];
    expect(assess({ ...base, inputs: { x: 1 }, rules }).outcome).toBe("low");
    expect(assess({ ...base, inputs: { x: 1 }, rules, jurisdiction: "VIC" }).outcome).toBe("high");
    expect(assess({ ...base, inputs: { x: 1 }, rules: [rule({ id: "au", then: { outcome: "medium" } })], jurisdiction: "WA" }).outcome).toBe("medium");
  });
  it("never applies needs_review or retired rules, but reports pending ones", () => {
    const r = assess({ ...base, inputs: { x: 1 }, rules: [
      rule({ id: "pending", status: "needs_review", source: undefined, then: { outcome: "high", escalate: true } }),
      rule({ id: "old", status: "retired", then: { outcome: "high" } }),
    ] });
    expect(r.outcome).toBe("low");
    expect(r.escalation_recommended).toBe(false);
    expect(r.rules_pending_review.map((x) => x.rule_id)).toEqual(["pending"]);
  });
  it("is deterministic and does not mutate its inputs", () => {
    const inputs = { x: 1 };
    const rules = [rule({ id: "r1", then: { outcome: "high" } })];
    const a = assess({ ...base, inputs, rules });
    expect(assess({ ...base, inputs, rules })).toEqual(a);
    expect(inputs).toEqual({ x: 1 });
  });
});

describe("per-jurisdiction start dates", () => {
  const staged = rule({ id: "staged", jurisdictions: ["NSW", "WA"], effective_from: "2012-01-01", effective_from_by_jurisdiction: { WA: "2022-03-31" }, then: { outcome: "high" } });
  const run = (jurisdiction: string, asOf: string) => assess({ ...base, inputs: { x: 1 }, rules: [staged], jurisdiction, asOf });

  it("starts the rule on the jurisdiction's own date, and on effective_from where none is given", () => {
    expect(run("NSW", "2012-01-01").outcome).toBe("high");
    expect(run("NSW", "2011-12-31").outcome).toBe("low");
    expect(run("WA", "2022-03-30").outcome).toBe("low"); // the rule exists, but had not started in WA
    expect(run("WA", "2022-03-31").outcome).toBe("high");
  });
  it("reports the date that applied to this jurisdiction as the reason's effective_from", () => {
    expect(run("WA", "2026-01-01").reasons[0]!.effective_from).toBe("2022-03-31");
    expect(run("NSW", "2026-01-01").reasons[0]!.effective_from).toBe("2012-01-01");
  });
});

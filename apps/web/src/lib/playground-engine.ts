import type { Condition, OutcomeConfig, Rule } from "@briesa/engine";
import { assessCore, todayAU, type AssessmentCore } from "@briesa/packs/core";
import { buildInputs, type Field } from "./schema-fields.ts";
import { humanize } from "./text.ts";

// Everything here is pure and browser-safe. It runs the same assessCore the API runs, so the playground cannot drift from it.

export interface LiveExample { id: string; jurisdiction: string; inputs: Record<string, unknown>; expectOutcome: string }
export interface LiveScenario { id: string; description: string; outcome: OutcomeConfig; fields: Field[]; examples: LiveExample[] }
export interface LivePack {
  id: string; name: string; status: "draft" | "beta" | "verified"; version: string; jurisdictions: string[];
  rules: Rule[]; scenarios: LiveScenario[];
}

export type Values = Record<string, string>;
export interface NotTriggered { id: string; title: string }

export type LiveResult =
  | { status: "incomplete"; missing: Field[]; answered: number; total: number }
  | { status: "ok"; core: AssessmentCore; notTriggered: NotTriggered[]; inputs: Record<string, unknown> };

const filled = (v: string | undefined) => v !== undefined && v !== "";
const corePack = (p: LivePack) => ({ manifest: { id: p.id, version: p.version, status: p.status }, rules: p.rules });
const applies = (r: Rule, jurisdiction: string) => r.jurisdictions.includes(jurisdiction as never);
const inForce = (r: Rule, on: string) => r.status === "active" && r.effective_from <= on && (!r.effective_to || on < r.effective_to);

/** Required fields the person has not answered yet. */
export function missingRequired(fields: Field[], values: Values): Field[] {
  return fields.filter((f) => f.required && !filled(values[f.path]));
}

/** Runs the rules on the current answers. Returns `incomplete` until every required question has an answer, as the API would reject the request. */
export function runLive(pack: LivePack, scenario: LiveScenario, jurisdiction: string, values: Values, asOf?: string): LiveResult {
  const missing = missingRequired(scenario.fields, values);
  const required = scenario.fields.filter((f) => f.required);
  if (missing.length > 0) return { status: "incomplete", missing, answered: required.length - missing.length, total: required.length };
  const inputs = buildInputs(scenario.fields, values);
  const { core } = assessCore(corePack(pack), scenario.outcome, { scenarioType: scenario.id, jurisdiction, inputs, asOf: asOf || undefined });
  const fired = new Set(core.reasons.map((r) => r.rule_id));
  const notTriggered = pack.rules
    .filter((r) => applies(r, jurisdiction) && inForce(r, core.as_of) && !fired.has(r.id))
    .map((r) => ({ id: r.id, title: r.title }));
  return { status: "ok", core, notTriggered, inputs };
}

const outcomeAt = (pack: LivePack, scenario: LiveScenario, jurisdiction: string, values: Values, asOf: string) =>
  assessCore(corePack(pack), scenario.outcome, { scenarioType: scenario.id, jurisdiction, inputs: buildInputs(scenario.fields, values), asOf }).core;

export interface Suggestion {
  path: string; label: string; /** What the answer would become, in words. */ change: string;
  outcome: string; /** The values after applying the change, ready to set. */ values: Values;
}

const human = humanize;

/**
 * Single-answer changes that would give a different outcome. For each question, tries every other answer (and for
 * multi-choice questions, adding or removing each option) and keeps the ones that move the outcome.
 */
export function whatIf(pack: LivePack, scenario: LiveScenario, jurisdiction: string, values: Values, asOf?: string, limit = 8): Suggestion[] {
  if (missingRequired(scenario.fields, values).length > 0) return [];
  const on = asOf || todayAU();
  const base = outcomeAt(pack, scenario, jurisdiction, values, on).outcome;
  const rank = (o: string) => scenario.outcome.order.indexOf(o);
  const out: Suggestion[] = [];
  const consider = (f: Field, next: string, change: string) => {
    const nv = { ...values, [f.path]: next };
    if (f.required && !filled(next)) return;
    const o = outcomeAt(pack, scenario, jurisdiction, nv, on).outcome;
    if (o !== base) out.push({ path: f.path, label: f.label, change, outcome: o, values: nv });
  };
  for (const f of scenario.fields) {
    const cur = values[f.path] ?? "";
    if (f.kind === "boolean") {
      const next = cur === "true" ? "false" : "true";
      consider(f, next, `${f.label}: ${next === "true" ? "Yes" : "No"}`);
    } else if (f.kind === "enum") {
      for (const o of f.options ?? []) {
        if (o !== cur) consider(f, o, `${f.label}: ${human(o)}`);
      }
    } else if (f.kind === "multi") {
      const chosen = cur.split(",").filter(Boolean);
      for (const o of f.options ?? []) {
        const has = chosen.includes(o);
        consider(f, (has ? chosen.filter((x) => x !== o) : [...chosen, o]).join(","), `${has ? "Remove" : "Add"} ${human(o)}`);
      }
    }
  }
  // Keep one suggestion per (question, outcome), most different from the current outcome first.
  const seen = new Set<string>();
  return out
    .filter((s) => { const k = `${s.path}|${s.outcome}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Math.abs(rank(b.outcome) - rank(base)) - Math.abs(rank(a.outcome) - rank(base)))
    .slice(0, limit);
}

export interface Segment { from: string | null; to: string | null; outcome: string; /** No rule was in force for this jurisdiction. */ noRules: boolean; rules: string[] }

/** How the answer to the same facts changes across time, as each rule starts or ends. Adjacent periods with identical results are merged. */
export function timeline(pack: LivePack, scenario: LiveScenario, jurisdiction: string, values: Values): Segment[] {
  if (missingRequired(scenario.fields, values).length > 0) return [];
  const relevant = pack.rules.filter((r) => r.status === "active" && applies(r, jurisdiction));
  const points = [...new Set(relevant.flatMap((r) => [r.effective_from, r.effective_to ?? ""]).filter(Boolean))].sort();
  if (points.length === 0) return [];
  const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const starts: (string | null)[] = [null, ...points];
  const segs: Segment[] = starts.map((from, i) => {
    const probe = from === null ? dayBefore(points[0]!) : from;
    const core = outcomeAt(pack, scenario, jurisdiction, values, probe);
    return { from, to: starts[i + 1] ?? null, outcome: core.outcome, noRules: !relevant.some((r) => inForce(r, probe)), rules: core.reasons.map((r) => `${r.rule_id}@${r.rule_version}`) };
  });
  const merged: Segment[] = [];
  for (const s of segs) {
    const last = merged.at(-1);
    if (last && last.outcome === s.outcome && last.noRules === s.noRules && last.rules.join() === s.rules.join()) last.to = s.to; else merged.push({ ...s });
  }
  return merged;
}

/** Input paths a rule's conditions read, so the form can show which answers a rule depends on. */
export function rulePaths(rule: Pick<Rule, "when">): string[] {
  const out = new Set<string>();
  const walk = (c: Condition) => {
    if ("all" in c) c.all.forEach(walk); else if ("any" in c) c.any.forEach(walk); else if ("not" in c) walk(c.not); else out.add(c.path);
  };
  walk(rule.when as Condition);
  return [...out];
}

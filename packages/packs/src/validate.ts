import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadPack, PackLoadError, type Issue, type Pack } from "./load.ts";
import { compileCheck, validateInputs } from "./inputs.ts";
import { runPack } from "./run.ts";

export interface ValidationReport {
  pack: Pack | null;
  issues: Issue[];
  needsReview: { kind: "rule" | "obligation"; id: string }[];
  scenariosRun: number;
}

const overlaps = (a: { from: string; to: string | null }, b: { from: string; to: string | null }) =>
  a.from < (b.to ?? "9999-12-31") && b.from < (a.to ?? "9999-12-31");

export function validatePack(dir: string): ValidationReport {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message });
  const report: ValidationReport = { pack: null, issues, needsReview: [], scenariosRun: 0 };

  let pack: Pack;
  try { pack = loadPack(dir); }
  catch (e) {
    if (e instanceof PackLoadError) issues.push(...e.issues); else throw e;
    return report;
  }
  report.pack = pack;
  const { manifest } = pack;

  if (!existsSync(join(pack.dir, "SOURCES.md"))) err("SOURCES.md", "missing");

  for (const [type, schema] of Object.entries(pack.inputSchemas)) {
    const msg = compileCheck(schema);
    if (msg) err(manifest.scenario_types[type]!.input_schema, `not a valid JSON Schema: ${msg}`);
  }

  // Rules
  const seen = new Set<string>();
  const windows = new Map<string, { version: string; from: string; to: string | null }[]>();
  for (const r of pack.rules) {
    const where = `rule ${r.id}@${r.version}`;
    if (seen.has(`${r.id}@${r.version}`)) err(where, "duplicate rule id + version");
    seen.add(`${r.id}@${r.version}`);
    if (!r.source && r.status !== "needs_review") err(where, "no source: add one or set status needs_review");
    if (r.status === "needs_review") report.needsReview.push({ kind: "rule", id: r.id });
    if (r.effective_to && r.effective_to <= r.effective_from) err(where, "effective_to must be after effective_from");
    for (const j of r.jurisdictions) {
      if (j !== "AU" && !manifest.jurisdictions.includes(j) && !manifest.jurisdictions.includes("AU")) err(where, `jurisdiction ${j} not declared in pack.yaml`);
    }
    for (const t of r.scenario_types ?? []) if (!manifest.scenario_types[t]) err(where, `unknown scenario_type '${t}'`);
    const types = r.scenario_types ?? Object.keys(manifest.scenario_types);
    if (r.then.outcome) {
      for (const t of types) {
        const cfg = manifest.scenario_types[t];
        if (cfg && !cfg.outcome.order.includes(r.then.outcome)) err(where, `outcome '${r.then.outcome}' not in order for '${t}'`);
      }
    }
    if (r.status !== "retired") {
      const w = windows.get(r.id) ?? [];
      const cur = { version: r.version, from: r.effective_from, to: r.effective_to ?? null };
      for (const o of w) if (overlaps(o, cur)) err(where, `effective dates overlap with version ${o.version}`);
      w.push(cur);
      windows.set(r.id, w);
    }
  }
  for (const [type, cfg] of Object.entries(manifest.scenario_types)) {
    if (!cfg.outcome.order.includes(cfg.outcome.default)) err("pack.yaml", `default outcome for '${type}' not in order`);
  }

  // Obligations
  const obIds = new Set<string>();
  for (const o of pack.obligations) {
    const where = `obligation ${o.id}`;
    if (obIds.has(o.id)) err(where, "duplicate id");
    obIds.add(o.id);
    if (!o.source && o.status !== "needs_review") err(where, "no source: add one or set status needs_review");
    if (o.status === "needs_review") report.needsReview.push({ kind: "obligation", id: o.id });
  }

  // Maturity
  if (manifest.status === "verified") {
    if (!manifest.reviewer) err("pack.yaml", "verified packs need reviewer metadata");
    if (report.needsReview.length) err("pack.yaml", `verified packs cannot contain needs_review items (${report.needsReview.length} found)`);
  }
  if (manifest.status !== "verified" && report.needsReview.length) {
    warn("pack", `${report.needsReview.length} item(s) need review before this pack can be verified`);
  }

  // Scenarios (regression tests)
  const ids = new Set<string>();
  for (const s of pack.scenarios) {
    const where = `scenario ${s.id}`;
    if (ids.has(s.id)) err(where, "duplicate id");
    ids.add(s.id);
    if (!manifest.scenario_types[s.scenario_type]) { err(where, `unknown scenario_type '${s.scenario_type}'`); continue; }
    const v = validateInputs(pack, s.scenario_type, s.inputs);
    if (!v.ok) { err(where, `inputs invalid: ${v.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`); continue; }
    report.scenariosRun++;
    const got = runPack(pack, { scenarioType: s.scenario_type, jurisdiction: s.jurisdiction, inputs: s.inputs, asOf: s.as_of });
    const x = s.expect;
    if (got.outcome !== x.outcome) err(where, `outcome: expected '${x.outcome}', got '${got.outcome}'`);
    if (x.escalation_recommended !== undefined && got.escalation_recommended !== x.escalation_recommended) err(where, `escalation_recommended: expected ${x.escalation_recommended}`);
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));
    if (x.action_ids && !sameSet(x.action_ids, got.required_actions.map((a) => a.id))) err(where, `actions: expected [${x.action_ids}], got [${got.required_actions.map((a) => a.id)}]`);
    if (x.reason_rule_ids && !sameSet(x.reason_rule_ids, got.reasons.map((r) => r.rule_id))) err(where, `reasons: expected [${x.reason_rule_ids}], got [${got.reasons.map((r) => r.rule_id)}]`);
    if (x.missing_paths && !sameSet(x.missing_paths, got.missing_information.map((m) => m.path))) err(where, `missing: expected [${x.missing_paths}], got [${got.missing_information.map((m) => m.path)}]`);
  }
  return report;
}

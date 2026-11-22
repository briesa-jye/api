import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackRegistry, scaffoldPack, validatePack } from "@briesa/packs";
import { makeWidgetPack } from "./packtools.ts";

const errs = (dir: string) => validatePack(dir).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`);

describe("scaffold + validator", () => {
  it("a freshly scaffolded pack is valid, draft and rule-free", () => {
    const dir = scaffoldPack(mkdtempSync(join(tmpdir(), "p-")), "anything");
    const r = validatePack(dir);
    expect(r.issues).toEqual([]);
    expect(r.pack?.manifest.status).toBe("draft");
    expect(r.pack?.rules).toHaveLength(0);
    expect(r.scenariosRun).toBe(1);
  });
  it("refuses to overwrite or accept bad names", () => {
    const root = mkdtempSync(join(tmpdir(), "p-"));
    scaffoldPack(root, "x");
    expect(() => scaffoldPack(root, "x")).toThrow(/exists/);
    expect(() => scaffoldPack(root, "../evil")).toThrow();
  });
  it("accepts the widget pack; needs_review rules are warned about, not errors", () => {
    const { dir } = makeWidgetPack();
    expect(errs(dir)).toEqual([]);
    const r = validatePack(dir);
    expect(r.needsReview).toEqual([{ kind: "rule", id: "unverified-thing" }]);
  });
  it("flags a rule with no source unless it is needs_review", () => {
    const { dir } = makeWidgetPack({ extraRules: [`id: nosrc
version: 1.0.0
title: t
description: d
jurisdictions: [AU]
when: { path: count, op: gt, value: 1 }
then: { outcome: review }
effective_from: "2020-01-01"
status: active
`] });
    expect(errs(dir).join("\n")).toMatch(/rule nosrc@1.0.0: no source/);
  });
  it("flags overlapping effective dates for the same rule id, allows adjacent windows", () => {
    const mk = (v: string, from: string, to: string | null) => `id: dated
version: ${v}
title: t
description: d
jurisdictions: [AU]
when: { path: count, op: gt, value: 1 }
then: { outcome: review }
source: { instrument: X }
effective_from: "${from}"
${to ? `effective_to: "${to}"` : ""}
status: active
`;
    const ok = makeWidgetPack({ extraRules: [mk("1.0.0", "2020-01-01", "2024-01-01"), mk("2.0.0", "2024-01-01", null)] });
    expect(errs(ok.dir)).toEqual([]);
    const bad = makeWidgetPack({ extraRules: [mk("1.0.0", "2020-01-01", "2024-06-01"), mk("2.0.0", "2024-01-01", null)] });
    expect(errs(bad.dir).join("\n")).toMatch(/overlap/);
  });
  it("rejects code-like conditions", () => {
    const { dir } = makeWidgetPack({ extraRules: [`id: badop
version: 1.0.0
title: t
description: d
jurisdictions: [AU]
when: { path: count, op: eval, value: "process.exit()" }
then: { outcome: review }
source: { instrument: X }
effective_from: "2020-01-01"
status: active
`] });
    expect(errs(dir).join("\n")).toMatch(/extra-0.yaml: when/);
  });
  it("flags outcomes outside the declared order", () => {
    const { dir } = makeWidgetPack({ extraRules: [`id: badout
version: 1.0.0
title: t
description: d
jurisdictions: [AU]
when: { path: count, op: gt, value: 1 }
then: { outcome: nonsense }
source: { instrument: X }
effective_from: "2020-01-01"
status: active
`] });
    expect(errs(dir).join("\n")).toMatch(/rule badout@1.0.0: outcome 'nonsense' not in order/);
  });
  it("verified packs need a reviewer and no needs_review items", () => {
    const { dir } = makeWidgetPack({ status: "verified" });
    const e = errs(dir).join("\n");
    expect(e).toMatch(/reviewer metadata/);
    expect(e).toMatch(/needs_review/);
  });
  it("fails a scenario whose expectation does not match", () => {
    const { dir } = makeWidgetPack();
    writeFileSync(join(dir, "scenarios/wrong.yaml"), `id: wrong
synthetic: true
scenario_type: inspect
jurisdiction: NSW
as_of: "2026-01-01"
inputs: { count: 500 }
expect: { outcome: ok }
`);
    expect(errs(dir).join("\n")).toMatch(/scenario wrong: outcome: expected 'ok', got 'review'/);
  });
  it("rejects scenarios not marked synthetic", () => {
    const { dir } = makeWidgetPack();
    writeFileSync(join(dir, "scenarios/real.yaml"), `id: real
synthetic: false
scenario_type: inspect
jurisdiction: NSW
as_of: "2026-01-01"
inputs: { count: 1 }
expect: { outcome: ok }
`);
    expect(errs(dir).length).toBeGreaterThan(0);
  });
  it("passes a correct scenario", () => {
    const { dir } = makeWidgetPack();
    writeFileSync(join(dir, "scenarios/good.yaml"), `id: good
synthetic: true
scenario_type: inspect
jurisdiction: VIC
as_of: "2026-01-01"
inputs: { count: 500, damaged: true }
expect: { outcome: urgent, escalation_recommended: true, action_ids: [second-inspector], reason_rule_ids: [large-batch, damage-vic], missing_paths: [supplier] }
`);
    expect(errs(dir)).toEqual([]);
    expect(validatePack(dir).scenariosRun).toBe(1);
  });
  it("registry loads a directory of packs and rejects duplicates", () => {
    const a = makeWidgetPack();
    expect(PackRegistry.fromDir(a.root).list().map((p) => p.manifest.id)).toEqual(["widgets"]);
    expect(() => { const r = PackRegistry.fromDir(a.root); r.add(r.get("widgets")!); }).toThrow(/duplicate/);
  });
});

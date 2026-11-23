import { resolve } from "node:path";
import { assessPack } from "@briesa/packs/assessment";
import { PackRegistry } from "@briesa/packs/registry";
import { describe, expect, it } from "vitest";
import { rulePaths, runLive, timeline, whatIf, type LivePack, type Values } from "../apps/web/src/lib/playground-engine.ts";
import { flattenSchema, toFormValues } from "../apps/web/src/lib/schema-fields.ts";
import { humanize } from "../apps/web/src/lib/text.ts";

const registry = PackRegistry.fromDir(resolve(import.meta.dirname, "../packs"));
const real = registry.list().filter((p) => p.rules.length > 0);

// Built the same way the dashboard builds it for the browser.
const live: LivePack[] = real.map((p) => ({
  id: p.manifest.id, name: p.manifest.name, status: p.manifest.status, version: p.manifest.version, jurisdictions: [...p.manifest.jurisdictions], rules: p.rules,
  scenarios: Object.entries(p.manifest.scenario_types).map(([id, cfg]) => ({
    id, description: cfg.description, outcome: cfg.outcome, fields: flattenSchema(p.inputSchemas[id]),
    examples: p.scenarios.filter((s) => s.scenario_type === id).map((s) => ({ id: s.id, jurisdiction: s.jurisdiction, inputs: s.inputs, expectOutcome: s.expect.outcome })),
  })),
}));
const whs = live.find((p) => p.id === "whs-incident-notification")!;
const whsScn = whs.scenarios[0]!;
const valuesFor = (id: string): { values: Values; jurisdiction: string; asOf: string } => {
  const ex = whsScn.examples.find((e) => e.id === id)!;
  const fixture = real.find((p) => p.manifest.id === whs.id)!.scenarios.find((s) => s.id === id)!;
  return { values: toFormValues(whsScn.fields, ex.inputs), jurisdiction: ex.jurisdiction, asOf: fixture.as_of };
};

describe("playground live engine", () => {
  it("gives exactly the same answer as the server's assessPack for every example in every real pack", () => {
    let n = 0;
    for (const p of real) {
      const lp = live.find((x) => x.id === p.manifest.id)!;
      for (const ex of p.scenarios) {
        const scn = lp.scenarios.find((s) => s.id === ex.scenario_type)!;
        const browser = runLive(lp, scn, ex.jurisdiction, toFormValues(scn.fields, ex.inputs), ex.as_of);
        const server = assessPack(p, { scenarioType: ex.scenario_type, jurisdiction: ex.jurisdiction, inputs: ex.inputs, asOf: ex.as_of });
        expect(browser.status, ex.id).toBe("ok");
        expect(server.ok, ex.id).toBe(true);
        if (browser.status === "ok" && server.ok) expect(browser.core, ex.id).toEqual(server.core);
        n++;
      }
    }
    expect(n).toBeGreaterThan(30);
  });

  it("waits for required answers instead of guessing, and reports progress", () => {
    const r = runLive(whs, whsScn, "NSW", {}, "2026-11-23");
    expect(r.status).toBe("incomplete");
    if (r.status === "incomplete") {
      expect(r.missing.map((f) => f.path).sort()).toEqual(["arose_from_work", "incident_type"]);
      expect(r.answered).toBe(0);
      expect(r.total).toBe(2);
    }
  });

  it("whatIf lists only answers that really change the outcome, and each suggestion reproduces", () => {
    const { values, jurisdiction, asOf } = valuesFor("death-nsw");
    const base = runLive(whs, whsScn, jurisdiction, values, asOf);
    if (base.status !== "ok") throw new Error("expected ok");
    const s = whatIf(whs, whsScn, jurisdiction, values, asOf);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.outcome !== base.core.outcome)).toBe(true);
    expect(s.some((x) => x.path === "arose_from_work" && x.outcome === "not_notifiable")).toBe(true);
    for (const x of s) {
      const again = runLive(whs, whsScn, jurisdiction, x.values, asOf);
      expect(again.status === "ok" && again.core.outcome).toBe(x.outcome); // tapping it gives what it promised
    }
  });

  it("timeline shows the ACT fracture answer changing on 19 November 2025, with nothing in force before the first rule", () => {
    const { values } = valuesFor("injury-fracture-act");
    const segs = timeline(whs, whsScn, "ACT", values);
    expect(segs[0]).toMatchObject({ from: null, noRules: false, outcome: "needs_information" }); // before the model laws started in the ACT: earlier laws applied
    const before = segs.find((s) => s.to === "2025-11-19");
    const after = segs.find((s) => s.from === "2025-11-19");
    expect(before?.outcome).toBe("needs_information");
    expect(after?.outcome).toBe("notifiable");
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toBe(segs[i - 1]!.to); // periods tile with no gaps
    expect(segs.at(-1)!.to).toBeNull();
    expect(timeline(whs, whsScn, "ACT", {})).toEqual([]); // nothing until the required questions are answered
  });

  it("timeline starts each jurisdiction's rules on the date the model laws began there", () => {
    const death: Values = { incident_type: "death", arose_from_work: "true" };
    const wa = timeline(whs, whsScn, "WA", death).filter((s) => !s.noRules);
    expect(wa.map((s) => [s.from, s.outcome])).toEqual([[null, "needs_information"], ["2022-03-31", "notifiable"]]); // the pre-commencement period is "any earlier date"
    const sa = timeline(whs, whsScn, "SA", death).filter((s) => !s.noRules);
    expect(sa.find((s) => s.outcome === "notifiable")?.from).toBe("2013-01-01");
    const nsw = timeline(whs, whsScn, "NSW", death).filter((s) => !s.noRules);
    expect(nsw.find((s) => s.outcome === "notifiable")?.from).toBe("2012-01-01");
    // Before commencement the answer is "earlier laws applied", never a silent "not notifiable".
    expect(runLive(whs, whsScn, "WA", death, "2021-06-01")).toMatchObject({ status: "ok", core: { outcome: "needs_information" } });
  });

  it("rulePaths finds the inputs a rule reads", () => {
    const rule = whs.rules.find((r) => r.id === "notifiable-incident")!;
    expect(rulePaths(rule)).toEqual(expect.arrayContaining(["incident_type", "arose_from_work", "injury_categories", "serious_risk_exposed"]));
  });

  it("humanize keeps regulatory acronyms in capitals", () => {
    expect(humanize("hold_pending_cdd")).toBe("hold pending CDD");
    expect(humanize("pep_status")).toBe("PEP status");
    expect(humanize("injury-fracture-act")).toBe("injury fracture act"); // 'act' is a word and a jurisdiction, so it is left alone
  });
});

import { resolve } from "node:path";
import { assessPack, DISCLAIMER } from "@briesa/packs/assessment";
import { PackRegistry } from "@briesa/packs/registry";
import { describe, expect, it } from "vitest";
import { buildInputs, flattenSchema, toFormValues } from "../apps/web/src/lib/schema-fields.ts";

const registry = PackRegistry.fromDir(resolve(import.meta.dirname, "../packs"));
const real = registry.list().filter((p) => p.rules.length > 0);

describe("playground form generation from pack schemas", () => {
  it("covers both real packs", () => {
    expect(real.map((p) => p.manifest.id).sort()).toEqual(["real-estate-aml", "whs-incident-notification"]);
  });

  for (const pack of real) {
    for (const scenarioType of Object.keys(pack.manifest.scenario_types)) {
      describe(`${pack.manifest.id} / ${scenarioType}`, () => {
        const fields = flattenSchema(pack.inputSchemas[scenarioType]);

        it("flattens every schema property into a field, nested ones with dot paths", () => {
          expect(fields.length).toBeGreaterThan(0);
          expect(new Set(fields.map((f) => f.path)).size).toBe(fields.length);
          for (const f of fields) expect(["enum", "multi", "boolean", "integer", "number", "string"]).toContain(f.kind);
          for (const f of fields.filter((x) => x.kind === "enum" || x.kind === "multi")) expect(f.options!.length).toBeGreaterThan(0);
        });

        for (const ex of pack.scenarios.filter((s) => s.scenario_type === scenarioType)) {
          it(`example '${ex.id}' round-trips through the form and gives its expected outcome`, () => {
            const rebuilt = buildInputs(fields, toFormValues(fields, ex.inputs));
            expect(rebuilt).toEqual(ex.inputs); // what the form would send equals the fixture's inputs
            const out = assessPack(pack, { scenarioType, jurisdiction: ex.jurisdiction, inputs: rebuilt, asOf: ex.as_of });
            expect(out.ok).toBe(true);
            if (out.ok) {
              expect(out.core.outcome).toBe(ex.expect.outcome);
              expect(out.core.disclaimer).toBe(DISCLAIMER);
              expect(out.core.pack.status).toBe(pack.manifest.status);
            }
          });
        }
      });
    }
  }

  it("omits empty fields, coerces types, and nests by path", () => {
    const fields = flattenSchema({ type: "object", required: ["a"], properties: {
      a: { type: "object", required: ["n"], properties: { n: { type: "integer", minimum: 0 }, b: { type: "boolean" }, e: { enum: ["x", "y"] } } },
      s: { type: "string" },
    } });
    expect(fields.map((f) => [f.path, f.kind, f.required])).toEqual([["a.n", "integer", true], ["a.b", "boolean", false], ["a.e", "enum", false], ["s", "string", false]]);
    expect(buildInputs(fields, { "a.n": "5", "a.b": "false", "a.e": "", s: "" })).toEqual({ a: { n: 5, b: false } });
    expect(buildInputs(fields, { "a.n": "abc" })).toEqual({ a: { n: "abc" } }); // bad numbers reach validation, which reports them
  });

  it("the shared assessment function reports the same errors the API does", () => {
    const pack = registry.get("whs-incident-notification")!;
    expect(assessPack(pack, { scenarioType: "nope", jurisdiction: "NSW", inputs: {} })).toMatchObject({ ok: false, code: "unknown_scenario_type" });
    expect(assessPack(pack, { scenarioType: "classify_incident", jurisdiction: "AU", inputs: { incident_type: "death", arose_from_work: true } })).toMatchObject({ ok: false, code: "unsupported_jurisdiction" });
    expect(assessPack(pack, { scenarioType: "classify_incident", jurisdiction: "NSW", inputs: {} })).toMatchObject({ ok: false, code: "invalid_inputs" });
  });
});

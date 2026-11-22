import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldPack } from "@briesa/packs";

/** Scaffolds a fictional, industry-neutral pack in a temp dir and fills it with DATA only. */
export function makeWidgetPack(opts: { status?: string; extraRules?: string[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "briesa-packs-"));
  const dir = scaffoldPack(root, "widgets");
  const manifest = `id: widgets
name: Widgets
industry: widgets
regulators: [Fictional Widget Authority]
jurisdictions: [NSW, VIC]
version: 1.2.0
status: ${opts.status ?? "beta"}
maintainers: [tests]
licence_tier: standard
reviewer: null
scenario_types:
  inspect:
    description: Inspect a widget batch
    input_schema: schemas/inspect.input.json
    outcome:
      order: [ok, review, urgent]
      default: ok
`;
  writeFileSync(join(dir, "pack.yaml"), manifest);
  writeFileSync(join(dir, "schemas/inspect.input.json"), JSON.stringify({
    type: "object", additionalProperties: false, required: ["count"],
    properties: { count: { type: "integer", minimum: 0 }, damaged: { type: "boolean" }, supplier: { type: "string" } },
  }));
  writeFileSync(join(dir, "schemas/general.input.json"), "{}");
  writeFileSync(join(dir, "scenarios/empty.yaml"), "");
  writeFileSync(join(dir, "rules/large-batch.yaml"), `id: large-batch
version: 1.0.0
title: Large batch needs review
description: Batches over 100 units need a second inspector.
jurisdictions: [AU]
when: { path: count, op: gt, value: 100 }
then:
  outcome: review
  required_actions: [{ id: second-inspector, description: Arrange a second inspector }]
  reason: Batch size exceeds 100.
source: { instrument: Fictional Widget Act 2000, section: s 1 }
effective_from: "2020-01-01"
status: active
`);
  writeFileSync(join(dir, "rules/damage-vic.yaml"), `id: damage-vic
version: 1.0.0
title: Damage in VIC is urgent
description: Damaged widgets in VIC are urgent.
jurisdictions: [VIC]
when: { all: [{ path: damaged, op: eq, value: true }, { path: supplier, op: missing }] }
then:
  outcome: urgent
  escalate: true
  missing_information: [{ path: supplier, description: Supplier name }]
source: { instrument: Fictional Widget Regulation 2001 (VIC), section: r 4 }
effective_from: "2020-01-01"
status: active
`);
  writeFileSync(join(dir, "rules/unverified.yaml"), `id: unverified-thing
version: 1.0.0
title: Unverified
description: Not yet sourced.
jurisdictions: [AU]
when: { path: count, op: gte, value: 1 }
then: { outcome: urgent }
effective_from: "2020-01-01"
status: needs_review
`);
  for (const [i, r] of (opts.extraRules ?? []).entries()) writeFileSync(join(dir, `rules/extra-${i}.yaml`), r);
  writeFileSync(join(dir, "obligations/keep-records.yaml"), `id: keep-records
title: Keep inspection records
description: Keep records of each inspection.
applies_to: [inspector]
jurisdictions: [AU]
deadline: 7 years
source: { instrument: Fictional Widget Act 2000, section: s 9 }
effective_from: "2020-01-01"
status: active
`);
  return { root, dir };
}

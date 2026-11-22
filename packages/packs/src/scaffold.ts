import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Creates an empty but valid draft pack. Contains no regulatory content. */
export function scaffoldPack(packsDir: string, industry: string, maintainer = "unassigned"): string {
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(industry)) throw new Error("industry must be lowercase letters, digits, - or _");
  const dir = join(packsDir, industry);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  for (const d of ["schemas", "rules", "obligations", "scenarios"]) mkdirSync(join(dir, d), { recursive: true });

  writeFileSync(join(dir, "pack.yaml"), `id: ${industry}
name: ${industry}
industry: ${industry}
regulators: []
jurisdictions: [AU]
version: 0.1.0
status: draft
maintainers: [${maintainer}]
licence_tier: standard
reviewer: null
scenario_types:
  general:
    description: General assessment (replace with real scenario types)
    input_schema: schemas/general.input.json
    outcome:
      order: [no_action_identified]
      default: no_action_identified
`);
  writeFileSync(join(dir, "schemas/general.input.json"), JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    properties: { example_field: { type: "string" } },
    required: [],
  }, null, 2) + "\n");
  writeFileSync(join(dir, "scenarios/empty.yaml"), `# Synthetic fixture: structure only, not regulatory content.
id: empty-pack-default
synthetic: true
scenario_type: general
jurisdiction: AU
as_of: "2026-01-01"
inputs: {}
expect:
  outcome: no_action_identified
  escalation_recommended: false
`);
  writeFileSync(join(dir, "SOURCES.md"), `# Sources\n\nList every authoritative source used by this pack with its retrieval date.\nNo rule may be added without a source here, or it must be \`status: needs_review\`.\n\n_None yet._\n`);
  return dir;
}

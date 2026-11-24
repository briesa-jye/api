import "server-only";
import { JURISDICTIONS } from "@briesa/engine";
import { flattenSchema } from "@/lib/schema-fields";
import { getRegistry } from "@/lib/packs";
import type { LivePack } from "@/lib/playground-engine";

export type PlaygroundPack = LivePack;

/** Packs that have rules, with everything the playground needs to run them in the browser: the rules themselves and form fields from each scenario's own input schema. */
export function playgroundCatalog(): LivePack[] {
  return getRegistry().list().filter((p) => p.rules.length > 0).map((p) => ({
    id: p.manifest.id,
    name: p.manifest.name,
    status: p.manifest.status,
    version: p.manifest.version,
    jurisdictions: p.manifest.jurisdictions.includes("AU") ? [...JURISDICTIONS] : p.manifest.jurisdictions,
    rules: p.rules,
    scenarios: Object.entries(p.manifest.scenario_types).map(([id, cfg]) => ({
      id,
      description: cfg.description,
      outcome: cfg.outcome,
      fields: flattenSchema(p.inputSchemas[id]),
      inputSchema: p.inputSchemas[id],
      examples: p.scenarios.filter((s) => s.scenario_type === id).map((s) => ({ id: s.id, jurisdiction: s.jurisdiction, inputs: s.inputs, expectOutcome: s.expect.outcome })),
    })),
  }));
}

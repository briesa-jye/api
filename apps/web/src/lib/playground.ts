import "server-only";
import { JURISDICTIONS } from "@briesa/engine";
import { flattenSchema, type Field } from "@/lib/schema-fields";
import { getRegistry } from "@/lib/packs";

export interface PlaygroundExample { id: string; jurisdiction: string; inputs: Record<string, unknown>; expectOutcome: string }
export interface PlaygroundScenario { id: string; description: string; outcomes: string[]; fields: Field[]; examples: PlaygroundExample[] }
export interface PlaygroundPack { id: string; name: string; status: string; jurisdictions: string[]; scenarios: PlaygroundScenario[] }

/** Packs that have rules, with form fields derived from each scenario type's own input schema. */
export function playgroundCatalog(): PlaygroundPack[] {
  return getRegistry().list().filter((p) => p.rules.length > 0).map((p) => ({
    id: p.manifest.id,
    name: p.manifest.name,
    status: p.manifest.status,
    jurisdictions: p.manifest.jurisdictions.includes("AU") ? [...JURISDICTIONS] : p.manifest.jurisdictions,
    scenarios: Object.entries(p.manifest.scenario_types).map(([id, cfg]) => ({
      id,
      description: cfg.description,
      outcomes: cfg.outcome.order,
      fields: flattenSchema(p.inputSchemas[id]),
      examples: p.scenarios.filter((s) => s.scenario_type === id).map((s) => ({ id: s.id, jurisdiction: s.jurisdiction, inputs: s.inputs, expectOutcome: s.expect.outcome })),
    })),
  }));
}

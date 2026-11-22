import "server-only";
import { resolve } from "node:path";
import { PackRegistry } from "@briesa/packs/registry";

/** The packs directory at the repo root. Next runs from apps/web, so it is two levels up. */
const PACKS_DIR = process.env.PACKS_DIR ?? resolve(process.cwd(), "../../packs");

let registry: PackRegistry | undefined;
export const getRegistry = () => (registry ??= PackRegistry.fromDir(PACKS_DIR));

export interface PackSummary {
  id: string;
  name: string;
  industry: string;
  status: "draft" | "beta" | "verified";
  version: string;
  regulators: string[];
  jurisdictions: string[];
  scenarioTypes: { id: string; description: string; outcomes: string[] }[];
  ruleCount: number;
  needsReviewCount: number;
  obligationCount: number;
  /** True for scaffolded packs that contain no rules yet. */
  empty: boolean;
}

export function listPacks(): PackSummary[] {
  return getRegistry().list().map((p) => ({
    id: p.manifest.id,
    name: p.manifest.name,
    industry: p.manifest.industry,
    status: p.manifest.status,
    version: p.manifest.version,
    regulators: p.manifest.regulators,
    jurisdictions: p.manifest.jurisdictions,
    scenarioTypes: Object.entries(p.manifest.scenario_types).map(([id, c]) => ({ id, description: c.description, outcomes: c.outcome.order })),
    ruleCount: p.rules.filter((r) => r.status === "active").length,
    needsReviewCount: p.rules.filter((r) => r.status === "needs_review").length + p.obligations.filter((o) => o.status === "needs_review").length,
    obligationCount: p.obligations.length,
    empty: p.rules.length === 0,
  }));
}

export const getPack = (id: string) => listPacks().find((p) => p.id === id) ?? null;

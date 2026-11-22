import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  ObligationSchema, RuleSchema, ScenarioFixtureSchema,
  type Obligation, type Rule, type ScenarioFixture,
} from "@briesa/engine";
import { parse as parseYaml } from "yaml";
import type { ZodType } from "zod";
import { ManifestSchema, type Manifest } from "./manifest.ts";

export interface Pack {
  dir: string;
  manifest: Manifest;
  rules: Rule[];
  obligations: Obligation[];
  scenarios: ScenarioFixture[];
  /** JSON Schema per scenario type. */
  inputSchemas: Record<string, object>;
}

export interface Issue {
  level: "error" | "warning";
  where: string;
  message: string;
}

export class PackLoadError extends Error {
  readonly issues: Issue[];
  constructor(issues: Issue[]) {
    super(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
    this.issues = issues;
  }
}

const yamlFiles = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => join(dir, f))
    : [];

function readItems<T>(dir: string, schema: ZodType<T>, base: string, issues: Issue[]): T[] {
  const out: T[] = [];
  for (const file of yamlFiles(dir)) {
    const where = relative(base, file);
    let doc: unknown;
    try { doc = parseYaml(readFileSync(file, "utf8")); }
    catch (e) { issues.push({ level: "error", where, message: `invalid YAML: ${(e as Error).message}` }); continue; }
    if (doc === null || doc === undefined) continue;
    for (const item of Array.isArray(doc) ? doc : [doc]) {
      const r = schema.safeParse(item);
      if (r.success) out.push(r.data);
      else for (const i of r.error.issues) issues.push({ level: "error", where, message: `${i.path.join(".") || "(root)"}: ${i.message}` });
    }
  }
  return out;
}

/** Loads and structurally validates a pack directory. Throws PackLoadError listing every problem found. */
export function loadPack(dir: string): Pack {
  const abs = resolve(dir);
  const issues: Issue[] = [];
  const manifestPath = join(abs, "pack.yaml");
  if (!existsSync(manifestPath)) throw new PackLoadError([{ level: "error", where: "pack.yaml", message: "missing" }]);

  let rawManifest: unknown;
  try { rawManifest = parseYaml(readFileSync(manifestPath, "utf8")); }
  catch (e) { throw new PackLoadError([{ level: "error", where: "pack.yaml", message: `invalid YAML: ${(e as Error).message}` }]); }
  const m = ManifestSchema.safeParse(rawManifest);
  if (!m.success) {
    throw new PackLoadError(m.error.issues.map((i) => ({ level: "error", where: "pack.yaml", message: `${i.path.join(".") || "(root)"}: ${i.message}` })));
  }
  const manifest = m.data;

  const inputSchemas: Record<string, object> = {};
  for (const [type, cfg] of Object.entries(manifest.scenario_types)) {
    const p = resolve(abs, cfg.input_schema);
    if (p !== abs && !p.startsWith(abs + sep)) { issues.push({ level: "error", where: "pack.yaml", message: `input_schema for '${type}' escapes the pack directory` }); continue; }
    if (!existsSync(p) || !statSync(p).isFile()) { issues.push({ level: "error", where: cfg.input_schema, message: "input schema file missing" }); continue; }
    try { inputSchemas[type] = JSON.parse(readFileSync(p, "utf8")); }
    catch (e) { issues.push({ level: "error", where: cfg.input_schema, message: `invalid JSON: ${(e as Error).message}` }); }
  }

  const rules = readItems(join(abs, "rules"), RuleSchema, abs, issues);
  const obligations = readItems(join(abs, "obligations"), ObligationSchema, abs, issues);
  const scenarios = readItems(join(abs, "scenarios"), ScenarioFixtureSchema, abs, issues);

  if (issues.length) throw new PackLoadError(issues);
  return { dir: abs, manifest, rules, obligations, scenarios, inputSchemas };
}

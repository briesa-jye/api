/** Turns a pack's JSON Schema (as written for its scenario inputs) into flat form fields and back. Pure, no I/O. */
export interface Field {
  /** Dot path into the inputs object, e.g. "customer.pep_status". */
  path: string;
  label: string;
  group: string;
  kind: "enum" | "boolean" | "integer" | "number" | "string";
  options?: string[];
  required: boolean;
  description?: string;
  min?: number;
}

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; enum?: unknown[]; description?: string; minimum?: number };

const humanize = (k: string) => { const s = k.replace(/_/g, " "); return s[0]!.toUpperCase() + s.slice(1); };

export function flattenSchema(schema: unknown, prefix = "", parentRequired = true): Field[] {
  const s = schema as Schema;
  const out: Field[] = [];
  const req = new Set(s.required ?? []);
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    const required = parentRequired && req.has(key);
    if (prop.type === "object") { out.push(...flattenSchema(prop, path, required)); continue; }
    const base = { path, label: humanize(key), group: prefix, required, description: prop.description };
    if (Array.isArray(prop.enum)) out.push({ ...base, kind: "enum", options: prop.enum.map(String) });
    else if (prop.type === "boolean") out.push({ ...base, kind: "boolean" });
    else if (prop.type === "integer" || prop.type === "number") out.push({ ...base, kind: prop.type, min: prop.minimum });
    else out.push({ ...base, kind: "string" });
  }
  return out;
}

const setPath = (obj: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts.at(-1)!] = value;
};

/** Form strings to a nested inputs object. Empty strings are omitted so optional fields stay absent. */
export function buildInputs(fields: Field[], values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.path];
    if (raw === undefined || raw === "") continue;
    if (f.kind === "boolean") setPath(out, f.path, raw === "true");
    else if (f.kind === "integer" || f.kind === "number") { const n = Number(raw); setPath(out, f.path, Number.isFinite(n) ? n : raw); }
    else setPath(out, f.path, raw);
  }
  return out;
}

/** A pack's example inputs (nested) to form strings. */
export function toFormValues(fields: Field[], inputs: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    let cur: unknown = inputs;
    for (const p of f.path.split(".")) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
    if (cur !== undefined && cur !== null) out[f.path] = String(cur);
  }
  return out;
}

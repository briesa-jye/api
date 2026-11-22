import { Ajv } from "ajv";
import type { Pack } from "./load.ts";

const ajv = new Ajv({ allErrors: true, strict: true });
const cache = new WeakMap<object, ReturnType<Ajv["compile"]>>();

export interface InputError { path: string; message: string }

export function validateInputs(pack: Pack, scenarioType: string, inputs: unknown): { ok: true } | { ok: false; errors: InputError[] } {
  const schema = pack.inputSchemas[scenarioType];
  if (!schema) return { ok: false, errors: [{ path: "", message: `unknown scenario_type '${scenarioType}'` }] };
  let fn = cache.get(schema);
  if (!fn) { fn = ajv.compile(schema); cache.set(schema, fn); }
  if (fn(inputs)) return { ok: true };
  return { ok: false, errors: (fn.errors ?? []).map((e) => ({ path: e.instancePath || "/", message: e.message ?? "invalid" })) };
}

/** Throws if the schema itself is not valid JSON Schema (used by the pack validator). */
export function compileCheck(schema: object): string | null {
  try { new Ajv({ strict: true }).compile(schema); return null; }
  catch (e) { return (e as Error).message; }
}

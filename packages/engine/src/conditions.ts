import type { Condition } from "./schema.ts";

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !Object.hasOwn(cur, key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const comparable = (a: unknown, b: unknown) =>
  (typeof a === "number" && typeof b === "number") || (typeof a === "string" && typeof b === "string");

const isPresent = (v: unknown) => v !== undefined && v !== null;

/** Pure and total: a missing input never throws, comparisons against it are simply false. */
export function evaluate(cond: Condition, inputs: unknown): boolean {
  if ("all" in cond) return cond.all.every((c) => evaluate(c, inputs));
  if ("any" in cond) return cond.any.some((c) => evaluate(c, inputs));
  if ("not" in cond) return !evaluate(cond.not, inputs);

  const actual = getPath(inputs, cond.path);
  const expected = cond.value;
  switch (cond.op) {
    case "exists": return isPresent(actual);
    case "missing": return !isPresent(actual);
    case "eq": return isPresent(actual) && actual === expected;
    case "neq": return isPresent(actual) && actual !== expected;
    case "in": return isPresent(actual) && (expected as unknown[]).includes(actual);
    case "not_in": return isPresent(actual) && !(expected as unknown[]).includes(actual);
    case "gt": return comparable(actual, expected) && (actual as number) > (expected as number);
    case "gte": return comparable(actual, expected) && (actual as number) >= (expected as number);
    case "lt": return comparable(actual, expected) && (actual as number) < (expected as number);
    case "lte": return comparable(actual, expected) && (actual as number) <= (expected as number);
    case "contains":
      return Array.isArray(actual) ? actual.includes(expected) : typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
  }
}

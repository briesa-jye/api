import { createHash } from "node:crypto";
import type { Pack } from "./load.ts";
import type { PackRegistry } from "./registry.ts";

export interface PackChange {
  packId: string;
  /** Pack-level change: new pack, removed pack, or version/status/reviewer changed. */
  pack: "added" | "removed" | "updated" | null;
  from: { version: string; status: string } | null;
  to: { version: string; status: string } | null;
  rules: { added: string[]; changed: string[]; removed: string[] };
}

const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v) ?? "null";
const hash = (v: unknown) => createHash("sha256").update(stable(v)).digest("hex");

const ruleMap = (p: Pack | undefined) => new Map((p?.rules ?? []).map((r) => [`${r.id}@${r.version}`, hash(r)]));

export function diffRegistries(before: PackRegistry, after: PackRegistry): PackChange[] {
  const ids = new Set([...before.list(), ...after.list()].map((p) => p.manifest.id));
  const out: PackChange[] = [];
  for (const id of [...ids].sort()) {
    const a = before.get(id) ?? undefined;
    const b = after.get(id) ?? undefined;
    const ra = ruleMap(a), rb = ruleMap(b);
    const rules = {
      added: [...rb.keys()].filter((k) => !ra.has(k)),
      removed: [...ra.keys()].filter((k) => !rb.has(k)),
      changed: [...rb.keys()].filter((k) => ra.has(k) && ra.get(k) !== rb.get(k)),
    };
    let pack: PackChange["pack"] = null;
    if (!a) pack = "added";
    else if (!b) pack = "removed";
    else if (hash(a.manifest) !== hash(b.manifest)) pack = "updated";
    if (pack || rules.added.length || rules.removed.length || rules.changed.length) {
      out.push({
        packId: id, pack,
        from: a ? { version: a.manifest.version, status: a.manifest.status } : null,
        to: b ? { version: b.manifest.version, status: b.manifest.status } : null,
        rules,
      });
    }
  }
  return out;
}

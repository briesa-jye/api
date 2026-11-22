import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadPack, type Pack } from "./load.ts";

export class PackRegistry {
  private packs = new Map<string, Pack>();
  static empty() { return new PackRegistry(); }

  /** Loads every subdirectory of `dir` that has a pack.yaml. Throws on the first broken pack. */
  static fromDir(dir: string): PackRegistry {
    const reg = new PackRegistry();
    if (!existsSync(dir)) return reg;
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory() && existsSync(join(p, "pack.yaml"))) reg.add(loadPack(p));
    }
    return reg;
  }
  add(pack: Pack) {
    if (this.packs.has(pack.manifest.id)) throw new Error(`duplicate pack id '${pack.manifest.id}'`);
    this.packs.set(pack.manifest.id, pack);
  }
  /** Swap contents in place so existing references (routes) see the new packs. */
  replaceWith(other: PackRegistry) { this.packs = new Map(other.packs); }
  get(id: string) { return this.packs.get(id) ?? null; }
  list() { return [...this.packs.values()]; }
}

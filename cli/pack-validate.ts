import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validatePack } from "@briesa/packs";

const arg = process.argv[2];
if (!arg) { console.error("usage: pnpm pack:validate <pack-id | path>"); process.exit(2); }
const dir = existsSync(resolve(arg)) ? resolve(arg) : resolve(import.meta.dirname, "../packs", arg);
const r = validatePack(dir);
for (const i of r.issues) console.log(`${i.level === "error" ? "ERROR  " : "warning"} ${i.where}: ${i.message}`);
const errors = r.issues.filter((i) => i.level === "error").length;
console.log(`\n${r.pack?.manifest.id ?? arg}: ${errors} error(s), ${r.scenariosRun} scenario(s) run, ${r.needsReview.length} item(s) need review`);
process.exit(errors ? 1 : 0);

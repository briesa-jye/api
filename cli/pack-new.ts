import { resolve } from "node:path";
import { scaffoldPack } from "@briesa/packs";

const industry = process.argv[2];
if (!industry) { console.error("usage: pnpm pack:new <industry>"); process.exit(2); }
try {
  const dir = scaffoldPack(resolve(import.meta.dirname, "../packs"), industry);
  console.log(`Created ${dir}\nNext: edit pack.yaml and schemas/, add rules, then run: pnpm pack:validate ${industry}`);
} catch (e) { console.error((e as Error).message); process.exit(1); }

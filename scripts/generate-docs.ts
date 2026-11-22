import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApi } from "../apps/api/src/openapi.ts";
import { renderReference } from "../apps/api/src/reference.ts";

const out = resolve(import.meta.dirname, "../docs");
mkdirSync(out, { recursive: true });
const spec = buildOpenApi();
writeFileSync(resolve(out, "openapi.json"), JSON.stringify(spec, null, 2) + "\n");
writeFileSync(resolve(out, "reference.md"), renderReference(spec));
console.log("wrote docs/openapi.json and docs/reference.md");

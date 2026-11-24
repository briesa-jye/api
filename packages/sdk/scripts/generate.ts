import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const root = resolve(import.meta.dirname, "../../..");
export const OPENAPI_PATH = resolve(root, "docs/openapi.json");
export const SCHEMA_PATH = resolve(import.meta.dirname, "../src/generated/schema.ts");

const HEADER = `// GENERATED from docs/openapi.json by packages/sdk/scripts/generate.ts. Do not edit by hand.
// Regenerate with: corepack pnpm sdk:generate   (a test fails if this file is out of date)
/* eslint-disable */
`;

/** The SDK's request and response types, straight from the API's own OpenAPI description, so they cannot drift from it. */
export async function generateSchema(): Promise<string> {
  const ast = await openapiTS(JSON.parse(readFileSync(OPENAPI_PATH, "utf8")));
  return HEADER + astToString(ast);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(SCHEMA_PATH, await generateSchema());
  console.log("wrote packages/sdk/src/generated/schema.ts");
}

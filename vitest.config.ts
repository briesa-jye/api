import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Lets tests import the web app's server code (its "@/..." alias and the server-only guard).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${resolve(import.meta.dirname, "apps/web/src")}/` },
      { find: "server-only", replacement: resolve(import.meta.dirname, "tests/stubs/server-only.ts") },
    ],
  },
});

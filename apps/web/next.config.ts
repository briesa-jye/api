import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // The app reads packs/ and docs/ from the repo root at runtime, so trace from the monorepo root and ship them.
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  outputFileTracingIncludes: { "/*": ["../../packs/**/*", "../../docs/**/*"] },
  // The workspace packages ship TypeScript source.
  transpilePackages: ["@briesa/accounts", "@briesa/db", "@briesa/packs", "@briesa/engine"],
  // Prisma's engine and pg are native/node-only; keep them out of the bundle.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default config;

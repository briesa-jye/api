# API server (apps/api). Not yet built in CI: verify on first deploy.
FROM node:24-slim
ENV NODE_ENV=production
RUN corepack enable && apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY cli/package.json cli/
COPY packages/accounts/package.json packages/accounts/
COPY packages/ai/package.json packages/ai/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/packs/package.json packages/packs/
# Schema first so the Prisma client can be generated during install (postinstall).
COPY packages/db/prisma packages/db/prisma
RUN pnpm install --frozen-lockfile --prod=false --filter @briesa/api...
COPY apps/api apps/api
COPY packages packages
COPY packs packs
EXPOSE 3000
USER node
CMD ["node", "apps/api/src/main.ts"]

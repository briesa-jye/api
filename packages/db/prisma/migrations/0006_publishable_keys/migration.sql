-- Publishable keys: safe to embed in a browser widget. Additive and backwards compatible: every existing key stays a plain secret key.
ALTER TABLE "ApiKey" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'secret';
ALTER TABLE "ApiKey" ADD COLUMN "allowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ApiKey" ADD COLUMN "monthlyCap" INTEGER;
ALTER TABLE "ApiKey" ADD COLUMN "publicKey" TEXT;

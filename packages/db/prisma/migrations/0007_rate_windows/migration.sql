-- Shared rate limiting across instances (opt-in with RATE_LIMIT_STORE=database). Additive: nothing reads this table until enabled.
CREATE TABLE "RateWindow" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "RateWindow_pkey" PRIMARY KEY ("key","windowStart")
);
CREATE INDEX "RateWindow_windowStart_idx" ON "RateWindow"("windowStart");

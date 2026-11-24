export interface RateLimitResult { remaining: number; resetMs: number }
export interface RateLimiter {
  /** `remaining` is how many requests are left in the window, or negative when over the limit. */
  hit(keyId: string, limitPerMinute: number, now?: number): RateLimitResult | Promise<RateLimitResult>;
}

/** Fixed-window in-memory limiter. Per process: use StoreRateLimiter when running more than one instance. */
export class MemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  hit(keyId: string, limit: number, now = Date.now()) {
    const w = this.windows.get(keyId);
    if (!w || now - w.start >= 60_000) {
      this.windows.set(keyId, { start: now, count: 1 });
      return { remaining: limit - 1, resetMs: 60_000 };
    }
    w.count++;
    const resetMs = 60_000 - (now - w.start);
    return { remaining: w.count > limit ? -1 : limit - w.count, resetMs };
  }
}

/**
 * Fixed-window limiter whose counters live in the database, so every instance shares one count.
 * Windows are aligned to the clock minute. If the database cannot be reached it falls back to this process's own
 * memory for that call: a database blip degrades to per-instance limits instead of rejecting or admitting everything.
 */
export class StoreRateLimiter implements RateLimiter {
  private fallback = new MemoryRateLimiter();
  private store: { hitRateWindow(key: string, windowStart: Date): Promise<number> };
  constructor(store: { hitRateWindow(key: string, windowStart: Date): Promise<number> }) { this.store = store; }
  async hit(keyId: string, limit: number, now = Date.now()) {
    const start = Math.floor(now / 60_000) * 60_000;
    try {
      const count = await this.store.hitRateWindow(keyId, new Date(start));
      return { remaining: count > limit ? -1 : limit - count, resetMs: start + 60_000 - now };
    } catch {
      return this.fallback.hit(keyId, limit, now);
    }
  }
}

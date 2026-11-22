export interface RateLimiter {
  /** Returns remaining requests, or -1 when over limit. */
  hit(keyId: string, limitPerMinute: number, now?: number): { remaining: number; resetMs: number };
}

/** Fixed-window in-memory limiter. Swap for a Redis implementation when running >1 instance. */
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

import { MemoryStore } from "@briesa/db";
import { describe, expect, it } from "vitest";
import { niceScale, outcomeColour } from "../apps/web/src/components/charts/scale.ts";
import { loadStats, pctChange } from "../apps/web/src/lib/analytics.ts";

const DAY = 86_400_000;
const NOW = new Date("2026-11-23T03:00:00Z"); // 14:00 on 23 Nov in Sydney

async function seed(store: MemoryStore, tenantId: string, daysAgo: number, outcome: string, opts: { test?: boolean; escalation?: boolean; packId?: string } = {}) {
  await store.appendAudit({
    requestId: `req_${Math.random().toString(36).slice(2, 10)}`, tenantId, keyId: "k", endpoint: "assess", packId: opts.packId ?? "p1", packVersion: "1",
    ruleVersions: null, inputsHash: "h", output: { outcome, escalation_recommended: opts.escalation ?? false }, model: null, test: opts.test ?? false,
    createdAt: new Date(NOW.getTime() - daysAgo * DAY),
  });
}

describe("dashboard analytics", () => {
  it("returns a continuous series, splits live and test, compares with the previous period and excludes other tenants", async () => {
    const store = new MemoryStore();
    const t = (await store.createTenant({ name: "A", billingExempt: true })).id;
    const other = (await store.createTenant({ name: "B", billingExempt: true })).id;
    await seed(store, t, 0, "notifiable", { escalation: true });
    await seed(store, t, 0, "not_notifiable", { test: true });
    await seed(store, t, 3, "notifiable", { escalation: true, packId: "p2" });
    await seed(store, t, 40, "notifiable"); // previous 30-day period
    await seed(store, t, 41, "notifiable", { escalation: true });
    await seed(store, t, 100, "notifiable"); // outside both periods
    await seed(store, other, 0, "notifiable");

    const s = await loadStats(store, t, 30, NOW);
    expect(s.series).toHaveLength(30);
    expect(new Set(s.series.map((d) => d.day)).size).toBe(30); // no gaps or repeats
    expect(s.series.at(-1)).toEqual({ day: "2026-11-23", live: 1, test: 1 });
    expect(s.total).toBe(3);
    expect(s.live).toBe(2);
    expect(s.test).toBe(1);
    expect(s.prevTotal).toBe(2);
    expect(s.escalationRate).toBeCloseTo(2 / 3);
    expect(s.prevEscalationRate).toBeCloseTo(1 / 2);
    expect(s.mix.map((m) => m.packId)).toEqual(["p1", "p2"]); // busiest pack first
    expect(s.mix[0]!.outcomes.map((o) => o.outcome).sort()).toEqual(["not_notifiable", "notifiable"]);
  });

  it("handles an empty account without dividing by zero", async () => {
    const store = new MemoryStore();
    const t = (await store.createTenant({ name: "A", billingExempt: true })).id;
    const s = await loadStats(store, t, 7, NOW);
    expect(s.total).toBe(0);
    expect(s.escalationRate).toBeNull();
    expect(s.mix).toEqual([]);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(15, 10)).toBeCloseTo(0.5);
  });
});

describe("chart helpers", () => {
  it("niceScale gives round ticks that cover the data", () => {
    for (const max of [0, 1, 3, 7, 13, 99, 480, 1234]) {
      const s = niceScale(max);
      expect(s.max).toBeGreaterThanOrEqual(max);
      expect(s.ticks[0]).toBe(0);
      expect(s.ticks.at(-1)).toBe(s.max);
    }
    expect(niceScale(7).ticks).toEqual([0, 2, 4, 6, 8]);
  });

  it("outcome colour follows rank: lowest neutral, highest orange, never the same twice on one scale", () => {
    for (const of of [2, 3, 4]) {
      const colours = Array.from({ length: of }, (_, i) => outcomeColour(i, of));
      expect(colours[0]).toBe("var(--series-neutral)");
      expect(colours.at(-1)).toBe("var(--series-2)");
      expect(new Set(colours).size).toBe(of);
    }
  });
});

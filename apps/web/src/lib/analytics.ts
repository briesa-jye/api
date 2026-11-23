import type { AuditStatRow, Store } from "@briesa/db";

const DAY_MS = 86_400_000;
const sydneyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" });
const dayKey = (d: Date) => sydneyDay.format(d);

export interface DayPoint { day: string; live: number; test: number }
export interface OutcomeMixRow { packId: string; total: number; outcomes: { outcome: string; count: number }[] }
export interface Stats {
  days: number;
  series: DayPoint[];
  total: number;
  prevTotal: number;
  live: number;
  test: number;
  escalated: number;
  escalationRate: number | null;
  prevEscalationRate: number | null;
  mix: OutcomeMixRow[];
}

const sum = (rows: AuditStatRow[], f: (r: AuditStatRow) => boolean = () => true) => rows.filter(f).reduce((n, r) => n + r.count, 0);

/** Assessment analytics for the last `days` days (Australia/Sydney calendar days) plus the same-length period before, for comparison. */
export async function loadStats(store: Store, tenantId: string, days = 30, now = new Date()): Promise<Stats> {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(new Date(now.getTime() - i * DAY_MS)));
  const first = keys[0]!;
  // Fetch two periods back (with a day of slack for the timezone boundary), then split by calendar day.
  const rows = await store.auditStats(tenantId, new Date(now.getTime() - (days * 2 + 1) * DAY_MS));
  const cur = rows.filter((r) => r.day >= first);
  const prev = rows.filter((r) => r.day < first && r.day >= dayKey(new Date(now.getTime() - (days * 2 - 1) * DAY_MS)));

  const byDay = new Map(keys.map((k) => [k, { day: k, live: 0, test: 0 }]));
  for (const r of cur) { const p = byDay.get(r.day); if (p) p[r.test ? "test" : "live"] += r.count; }

  const packs = new Map<string, Map<string, number>>();
  for (const r of cur) {
    const pack = r.packId ?? "unknown";
    const m = packs.get(pack) ?? new Map<string, number>();
    m.set(r.outcome ?? "unknown", (m.get(r.outcome ?? "unknown") ?? 0) + r.count);
    packs.set(pack, m);
  }
  const total = sum(cur), prevTotal = sum(prev);
  const escalated = sum(cur, (r) => r.escalated), prevEscalated = sum(prev, (r) => r.escalated);
  return {
    days, series: [...byDay.values()], total, prevTotal,
    live: sum(cur, (r) => !r.test), test: sum(cur, (r) => r.test),
    escalated, escalationRate: total ? escalated / total : null, prevEscalationRate: prevTotal ? prevEscalated / prevTotal : null,
    mix: [...packs.entries()].map(([packId, m]) => ({ packId, total: [...m.values()].reduce((a, b) => a + b, 0), outcomes: [...m.entries()].map(([outcome, count]) => ({ outcome, count })) })).sort((a, b) => b.total - a.total),
  };
}

/** Percentage change, or null when there is no earlier period to compare with. */
export const pctChange = (now: number, before: number): number | null => (before === 0 ? null : (now - before) / before);

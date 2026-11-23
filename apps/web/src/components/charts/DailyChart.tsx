"use client";

import { useId, useState } from "react";
import { niceScale } from "./scale";

export interface DayPoint { day: string; live: number; test: number }

const W = 720, H = 240, L = 36, R = 8, T = 10, B = 26;
/** A column anchored to the baseline: flat bottom, top corners rounded by r. */
const bar = (x: number, yBottom: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h);
  const top = yBottom - h;
  return rr > 0
    ? `M${x},${yBottom} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${yBottom} Z`
    : `M${x},${yBottom} V${top} H${x + w} V${yBottom} Z`;
};
// Pinned to UTC so the server and the browser (possibly in different time zones) print the same label for a calendar day.
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

/** Daily assessments, stacked live over test. Hover or focus a day for the exact numbers; the table view lists them all. */
export function DailyChart({ data, title }: { data: DayPoint[]; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const uid = useId();
  const max = Math.max(0, ...data.map((d) => d.live + d.test));
  const { max: yMax, ticks } = niceScale(max);
  const band = (W - L - R) / data.length;
  const bw = Math.max(2, Math.min(band * 0.72, 22));
  const y = (v: number) => T + (H - T - B) * (1 - v / yMax);
  const tickEvery = Math.ceil(data.length / 7);
  const totals = { live: data.reduce((n, d) => n + d.live, 0), test: data.reduce((n, d) => n + d.test, 0) };
  const a = active === null ? null : data[active]!;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-base">{title}</span>
        <span className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: "var(--series-1)" }} />Live <b className="text-foreground font-medium tabular-nums">{totals.live}</b></span>
          <span className="text-muted-foreground flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: "var(--series-2)" }} />Test <b className="text-foreground font-medium tabular-nums">{totals.test}</b></span>
          <button type="button" onClick={() => setTable((t) => !t)} aria-pressed={table} className="text-muted-foreground hover:text-foreground underline underline-offset-4">{table ? "Chart" : "Table"}</button>
        </span>
      </figcaption>

      {table ? (
        <div className="max-h-60 overflow-auto rounded-lg border">
          <table className="w-full text-sm"><thead className="bg-muted/30 text-muted-foreground sticky top-0 text-left text-xs"><tr><th className="px-3 py-2">Day</th><th className="px-3 py-2 text-right">Live</th><th className="px-3 py-2 text-right">Test</th></tr></thead>
            <tbody className="divide-y divide-dashed">{[...data].reverse().map((d) => <tr key={d.day}><td className="px-3 py-1.5">{fmtDay(d.day)}</td><td className="px-3 py-1.5 text-right tabular-nums">{d.live}</td><td className="px-3 py-1.5 text-right tabular-nums">{d.test}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t`} className="h-auto w-full overflow-visible" onPointerLeave={() => setActive(null)}>
            <title id={`${uid}-t`}>{`${title}: ${totals.live} live and ${totals.test} test assessments over ${data.length} days.`}</title>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground" fontSize={11}>{t}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = L + band * i + band / 2, x = cx - bw / 2;
              const hLive = (H - T - B) * (d.live / yMax), hTest = (H - T - B) * (d.test / yMax);
              const dim = active !== null && active !== i;
              const gap = d.live > 0 && d.test > 0 ? 2 : 0;
              return (
                <g key={d.day} opacity={dim ? 0.55 : 1}>
                  {d.live > 0 && <path d={bar(x, y(0), bw, hLive, d.test > 0 ? 0 : 4)} fill="var(--series-1)" />}
                  {d.test > 0 && <path d={bar(x, y(0) - hLive - gap, bw, hTest, 4)} fill="var(--series-2)" />}
                  {i % tickEvery === 0 && <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>{fmtDay(d.day)}</text>}
                  <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" tabIndex={0} role="img"
                    aria-label={`${fmtDay(d.day)}: ${d.live} live, ${d.test} test`}
                    onPointerMove={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
                </g>
              );
            })}
          </svg>
          {a && active !== null && (
            <div className="bg-popover pointer-events-none absolute z-10 min-w-36 rounded-lg border px-3 py-2 text-xs shadow-lg"
              style={{ left: `${((L + band * active + band / 2) / W) * 100}%`, top: 0, transform: `translateX(${active > data.length / 2 ? "-105%" : "5%"})` }}>
              <p className="text-muted-foreground mb-1">{fmtDay(a.day)}</p>
              <p className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-3" style={{ background: "var(--series-1)" }} />Live</span><b className="tabular-nums">{a.live}</b></p>
              <p className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-3" style={{ background: "var(--series-2)" }} />Test</span><b className="tabular-nums">{a.test}</b></p>
            </div>
          )}
          {max === 0 && <p className="text-muted-foreground absolute inset-0 flex items-center justify-center pb-6 text-sm">No assessments in this period yet.</p>}
        </div>
      )}
    </figure>
  );
}

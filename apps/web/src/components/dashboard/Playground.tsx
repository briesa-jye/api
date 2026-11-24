"use client";

import { ArrowRight, CalendarClock, Link2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { OutcomeTimeline } from "@/components/charts/OutcomeTimeline";
import { outcomeColour } from "@/components/charts/scale";
import { AssessmentResult } from "@/components/dashboard/AssessmentResult";
import { Chips } from "@/components/ui/chips";
import { Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import { Control } from "@/components/dashboard/FieldControl";
import { rulePaths, runLive, timeline, whatIf, type LivePack, type LiveScenario, type Values } from "@/lib/playground-engine";
import { toFormValues, type Field } from "@/lib/schema-fields";
import { humanize, sentence } from "@/lib/text";


/** The first example of a scenario, as form values, so the page opens with a real answer instead of an empty form. */
function startingPoint(pack: LivePack, scenario: LiveScenario) {
  const ex = scenario.examples[0];
  return { jurisdiction: ex?.jurisdiction ?? pack.jurisdictions[0]!, values: ex ? toFormValues(scenario.fields, ex.inputs) : ({} as Values) };
}

const strMap = (v: unknown): Values => Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([, x]) => typeof x === "string")) as Values;

export function Playground({ catalog }: { catalog: LivePack[] }) {
  const first = catalog[0]!;
  const start = startingPoint(first, first.scenarios[0]!);
  const [packId, setPackId] = useState(first.id);
  const [scenarioId, setScenarioId] = useState(first.scenarios[0]!.id);
  const [jurisdiction, setJurisdiction] = useState(start.jurisdiction);
  const [values, setValues] = useState<Values>(start.values);
  const [asOf, setAsOf] = useState("");
  const [reference, setReference] = useState("");
  const [hoverRule, setHoverRule] = useState<string | null>(null);
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [changed, setChanged] = useState<{ from: string; to: string } | null>(null);

  const pack = catalog.find((p) => p.id === packId)!;
  const scenario = pack.scenarios.find((s) => s.id === scenarioId) ?? pack.scenarios[0]!;
  const live = useMemo(() => runLive(pack, scenario, jurisdiction, values, asOf), [pack, scenario, jurisdiction, values, asOf]);
  const suggestions = useMemo(() => (live.status === "ok" ? whatIf(pack, scenario, jurisdiction, values, asOf) : []), [live.status, pack, scenario, jurisdiction, values, asOf]);
  const segments = useMemo(() => timeline(pack, scenario, jurisdiction, values), [pack, scenario, jurisdiction, values]);

  // Highlight the questions a hovered rule or suggestion depends on.
  const highlight = useMemo(() => {
    if (hoverPath) return new Set([hoverPath]);
    const rule = hoverRule ? pack.rules.find((r) => r.id === hoverRule) : null;
    return new Set(rule ? rulePaths(rule) : []);
  }, [hoverRule, hoverPath, pack]);

  // Say so when an edit moves the outcome.
  const prev = useRef<{ key: string; outcome: string } | null>(null);
  const outcome = live.status === "ok" ? live.core.outcome : null;
  useEffect(() => {
    const key = `${packId}/${scenarioId}`;
    if (outcome === null) return;
    if (prev.current && prev.current.key === key && prev.current.outcome !== outcome) {
      setChanged({ from: prev.current.outcome, to: outcome });
      const t = setTimeout(() => setChanged(null), 4500);
      prev.current = { key, outcome };
      return () => clearTimeout(t);
    }
    prev.current = { key, outcome };
  }, [outcome, packId, scenarioId]);

  // Restore a shared link (#s=...).
  useEffect(() => {
    try {
      const m = /^#s=(.+)$/.exec(window.location.hash);
      if (!m) return;
      const d = JSON.parse(decodeURIComponent(escape(atob(m[1]!)))) as Record<string, unknown>;
      const p = catalog.find((x) => x.id === d.pack), sc = p?.scenarios.find((x) => x.id === d.scenario);
      if (!p || !sc) return;
      setPackId(p.id); setScenarioId(sc.id);
      setJurisdiction(p.jurisdictions.includes(String(d.jurisdiction)) ? String(d.jurisdiction) : p.jurisdictions[0]!);
      setValues(strMap(d.values)); setAsOf(String(d.asOf ?? "")); setReference(String(d.reference ?? ""));
      prev.current = null;
    } catch { /* a malformed link is ignored */ }
  }, [catalog]);

  const reset = (p: LivePack, sc: LiveScenario) => {
    const s = startingPoint(p, sc);
    setJurisdiction(s.jurisdiction); setValues(s.values); setAsOf(""); prev.current = null; setChanged(null);
  };
  const choosePack = (id: string) => { const p = catalog.find((x) => x.id === id)!; setPackId(id); setScenarioId(p.scenarios[0]!.id); reset(p, p.scenarios[0]!); };
  const chooseScenario = (id: string) => { const sc = pack.scenarios.find((x) => x.id === id)!; setScenarioId(id); reset(pack, sc); };
  const set = (path: string, v: string) => setValues((cur) => ({ ...cur, [path]: v }));
  const copyLink = async () => {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ pack: packId, scenario: scenarioId, jurisdiction, values, asOf, reference }))));
    const url = `${window.location.origin}${window.location.pathname}#s=${payload}`;
    try { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); } catch { window.location.hash = `s=${payload}`; }
  };
  const jump = (path: string) => {
    const el = document.querySelector<HTMLElement>(`[data-q="${CSS.escape(path)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
  };

  const groups = useMemo(() => {
    const g = new Map<string, Field[]>();
    for (const f of scenario.fields) g.set(f.group, [...(g.get(f.group) ?? []), f]);
    return [...g.entries()];
  }, [scenario]);
  const order = scenario.outcome.order;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      {/* ---------- the facts ---------- */}
      <div className="bg-card space-y-6 self-start rounded-xl border p-6">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground flex items-center gap-1.5 font-mono text-[0.625rem] tracking-wider uppercase"><Sparkles className="size-3" aria-hidden />Live</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => reset(pack, scenario)} className="text-muted-foreground hover:text-foreground hover:bg-muted/40 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"><RotateCcw className="size-3" aria-hidden />Reset</button>
            <button type="button" onClick={copyLink} className="text-muted-foreground hover:text-foreground hover:bg-muted/40 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"><Link2 className="size-3" aria-hidden />{linkCopied ? "Link copied" : "Share"}</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="pg-pack">Pack</Label>
            <SelectMenu id="pg-pack" value={packId} onValueChange={choosePack} options={catalog.map((p) => ({ value: p.id, label: p.name, hint: `${p.status} · v${p.version}` }))} />
          </div>
          {pack.scenarios.length > 1 && (
            <div className="space-y-2"><Label htmlFor="pg-scn">Scenario type</Label>
              <SelectMenu id="pg-scn" value={scenario.id} onValueChange={chooseScenario} options={pack.scenarios.map((s) => ({ value: s.id, label: humanize(s.id), hint: s.description }))} />
            </div>
          )}
          <div className="space-y-2"><Label>Jurisdiction</Label>
            <Segmented aria-label="Jurisdiction" value={jurisdiction} onValueChange={(v) => v && setJurisdiction(v)} options={pack.jurisdictions.map((j) => ({ value: j, label: j }))} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{scenario.description}</p>

        {scenario.examples.length > 0 && (
          <details className="group border-t border-dashed pt-4">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">Start from an example ({scenario.examples.length})</summary>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scenario.examples.map((ex) => (
                <button key={ex.id} type="button" onClick={() => { setJurisdiction(ex.jurisdiction); setValues(toFormValues(scenario.fields, ex.inputs)); }}
                  className="hover:border-accent/60 hover:bg-muted/40 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors active:scale-95">
                  {humanize(ex.id)}<span className="text-muted-foreground block font-mono text-[0.625rem]">{humanize(ex.expectOutcome)}</span>
                </button>
              ))}
            </div>
          </details>
        )}

        {groups.map(([group, fields]) => (
          <fieldset key={group || "root"} className="space-y-5 border-t border-dashed pt-5">
            {group && <legend className="text-muted-foreground bg-card -mt-8 px-2 font-mono text-[0.625rem] tracking-wider uppercase">{humanize(group)}</legend>}
            {fields.map((f) => (
              <div key={f.path} data-q={f.path} className={`-mx-2 space-y-2 rounded-lg px-2 py-1.5 transition-colors duration-200 ${highlight.has(f.path) ? "bg-accent/10 ring-accent/50 ring-2" : ""}`}>
                <Label htmlFor={`f-${f.path}`}>{f.label}{f.required && <span className="text-accent-hover ml-1" aria-label="required">*</span>}</Label>
                <Control f={f} value={values[f.path] ?? ""} onChange={(v) => set(f.path, v)} />
                {f.description && <p className="text-muted-foreground text-xs leading-relaxed">{f.description}</p>}
              </div>
            ))}
          </fieldset>
        ))}

        <div className="space-y-4 border-t border-dashed pt-5">
          <div className="space-y-2">
            <Label htmlFor="pg-asof">Rules as of</Label>
            <div className="flex gap-2"><Input id="pg-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />{asOf && <button type="button" onClick={() => setAsOf("")} className="text-muted-foreground hover:text-foreground shrink-0 px-2 text-xs">Today</button>}</div>
            <p className="text-muted-foreground text-xs">Empty means today. Or tap a period in the timeline.</p>
          </div>
          <div className="space-y-2"><Label htmlFor="pg-ref">Your reference</Label><Input id="pg-ref" maxLength={200} placeholder="e.g. matter-1042" value={reference} onChange={(e) => setReference(e.target.value)} /><p className="text-muted-foreground text-xs">Shown in the sample code. Never put personal information here.</p></div>
        </div>
      </div>

      {/* ---------- the decision ---------- */}
      <div id="pg-decision" className="min-w-0 scroll-mt-4 space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        {live.status === "incomplete" ? (
          <section className="bg-card rounded-xl border p-6">
            <p className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">Waiting for answers</p>
            <p className="font-display mt-2 text-2xl tracking-tight">{live.total - live.answered} more to go</p>
            <div className="bg-muted mt-4 h-2 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={live.total} aria-valuenow={live.answered} aria-label="Required questions answered">
              <div className="bg-accent h-full rounded-full transition-all duration-300" style={{ width: `${(live.answered / Math.max(1, live.total)) * 100}%` }} />
            </div>
            <ul className="mt-4 space-y-1">
              {live.missing.map((f) => <li key={f.path}><button type="button" onClick={() => jump(f.path)} className="hover:bg-muted/40 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm"><span>{f.label}</span><ArrowRight className="text-muted-foreground size-3.5" aria-hidden /></button></li>)}
            </ul>
          </section>
        ) : (
          <>
            {changed && (
              <div className="animate-in fade-in slide-in-from-top-1 bg-accent/10 border-accent/40 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm" role="status">
                <Sparkles className="text-accent-hover size-4" aria-hidden />Outcome changed
                <b className="font-medium">{humanize(changed.from)}</b><ArrowRight className="text-muted-foreground size-3.5" aria-hidden /><b className="font-medium">{humanize(changed.to)}</b>
              </div>
            )}
            <AssessmentResult
              core={live.core} outcomes={order} notTriggered={live.notTriggered} onRuleHover={setHoverRule}
              request={{ pack: packId, scenario_type: scenarioId, jurisdiction, inputs: live.inputs, ...(asOf && { as_of: asOf }), ...(reference && { reference }) }}
              afterOutcome={
                <>
                  <section className="bg-card rounded-xl border p-5">
                    <h3 className="font-display text-base">What would change this</h3>
                    <p className="text-muted-foreground mt-1 text-xs">One answer at a time. Tap to try it.</p>
                    {suggestions.length === 0 ? <p className="text-muted-foreground mt-3 text-sm">No single change to these answers gives a different outcome.</p> : (
                      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {suggestions.map((s) => (
                          <li key={`${s.path}|${s.outcome}`}>
                            <button type="button" onClick={() => setValues(s.values)} onPointerEnter={() => setHoverPath(s.path)} onPointerLeave={() => setHoverPath(null)} onFocus={() => setHoverPath(s.path)} onBlur={() => setHoverPath(null)}
                              className="hover:border-accent/60 hover:bg-muted/30 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors active:scale-[0.98]">
                              <span className="min-w-0 leading-snug">{s.change}</span>
                              <span className="flex shrink-0 items-center gap-1.5 text-xs"><ArrowRight className="text-muted-foreground size-3" aria-hidden /><i className="inline-block size-2 rounded-full" style={{ background: outcomeColour(order.indexOf(s.outcome), order.length) }} aria-hidden />{humanize(s.outcome)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  {segments.length > 1 && (
                    <section className="bg-card rounded-xl border p-5">
                      <h3 className="font-display flex items-center gap-2 text-base"><CalendarClock className="text-muted-foreground size-4" aria-hidden />The same facts over time</h3>
                      <p className="text-muted-foreground mt-1 mb-4 text-xs">The answer under the rules in force in each period. Tap a period to check that date.</p>
                      <OutcomeTimeline segments={segments} order={order} date={live.core.as_of} onPick={setAsOf} />
                    </section>
                  )}
                </>
              }
            />
          </>
        )}
      </div>

      {/* On small screens the decision is far below the questions, so keep the live outcome in view. */}
      <button type="button" onClick={() => document.getElementById("pg-decision")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="bg-popover/95 fixed inset-x-4 bottom-4 z-30 flex items-center justify-between gap-3 rounded-full border px-4 py-2.5 text-sm shadow-xl backdrop-blur xl:hidden" aria-label="Jump to the decision">
        {live.status === "ok" ? (
          <span className="flex min-w-0 items-center gap-2"><i className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: outcomeColour(order.indexOf(live.core.outcome), order.length) }} aria-hidden /><span className="truncate font-medium">{sentence(humanize(live.core.outcome))}</span></span>
        ) : (
          <span className="text-muted-foreground">{live.total - live.answered} more to answer</span>
        )}
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">See decision <ArrowRight className="size-3 rotate-90" aria-hidden /></span>
      </button>
    </div>
  );
}

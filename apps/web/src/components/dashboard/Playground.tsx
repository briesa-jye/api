"use client";

import { History, Link2, Play } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { runPlaygroundAction, type PlaygroundResult } from "@/app/dashboard/actions";
import { AssessmentResult } from "@/components/dashboard/AssessmentResult";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice, Select } from "@/components/ui/input";
import type { PlaygroundPack } from "@/lib/playground";
import { toFormValues } from "@/lib/schema-fields";

const humanize = (s: string) => s.replace(/_/g, " ");

interface Run { at: number; pack: string; scenario: string; jurisdiction: string; values: Record<string, string>; asOf: string; outcome: string }
const HISTORY_KEY = "briesa.playground.history";
const readHistory = (): Run[] => { try { const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); return Array.isArray(v) ? v.slice(0, 8) : []; } catch { return []; } };
const writeHistory = (r: Run[]) => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(r.slice(0, 8))); } catch { /* storage blocked: history just isn't kept */ } };
const strMap = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([, x]) => typeof x === "string")) as Record<string, string>;

export function Playground({ catalog }: { catalog: PlaygroundPack[] }) {
  const [packId, setPackId] = useState(catalog[0]!.id);
  const pack = catalog.find((p) => p.id === packId)!;
  const [scenarioId, setScenarioId] = useState(pack.scenarios[0]!.id);
  const scenario = pack.scenarios.find((s) => s.id === scenarioId) ?? pack.scenarios[0]!;
  const [jurisdiction, setJurisdiction] = useState(pack.jurisdictions[0]!);
  const [values, setValues] = useState<Record<string, string>>({});
  const [asOf, setAsOf] = useState("");
  const [compareAsOf, setCompareAsOf] = useState("");
  const [reference, setReference] = useState("");
  const [history, setHistory] = useState<Run[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [state, action, pending] = useActionState<PlaygroundResult, FormData>(runPlaygroundAction, null);
  const logged = useRef<PlaygroundResult>(null);

  // Restore a shared link (#s=...) and the saved history once the page is in the browser.
  useEffect(() => {
    setHistory(readHistory());
    try {
      const m = /^#s=(.+)$/.exec(window.location.hash);
      if (!m) return;
      const d = JSON.parse(decodeURIComponent(escape(atob(m[1]!)))) as Record<string, unknown>;
      const p = catalog.find((x) => x.id === d.pack), sc = p?.scenarios.find((x) => x.id === d.scenario);
      if (!p || !sc) return;
      setPackId(p.id); setScenarioId(sc.id);
      setJurisdiction(p.jurisdictions.includes(String(d.jurisdiction)) ? String(d.jurisdiction) : p.jurisdictions[0]!);
      setValues(strMap(d.values)); setAsOf(String(d.asOf ?? "")); setCompareAsOf(String(d.compareAsOf ?? "")); setReference(String(d.reference ?? ""));
    } catch { /* a malformed link is ignored */ }
  }, [catalog]);

  // Remember each successful run so it can be re-opened.
  useEffect(() => {
    if (!state?.ok || logged.current === state) return;
    logged.current = state;
    const run: Run = { at: Date.now(), pack: packId, scenario: scenarioId, jurisdiction, values, asOf, outcome: state.core.outcome };
    setHistory((h) => { const next = [run, ...h].slice(0, 8); writeHistory(next); return next; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const reopen = (r: Run) => {
    const p = catalog.find((x) => x.id === r.pack); if (!p) return;
    setPackId(r.pack); setScenarioId(r.scenario); setJurisdiction(r.jurisdiction); setValues(r.values); setAsOf(r.asOf);
  };
  const copyLink = async () => {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ pack: packId, scenario: scenarioId, jurisdiction, values, asOf, compareAsOf, reference }))));
    const url = `${window.location.origin}${window.location.pathname}#s=${payload}`;
    try { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); } catch { window.location.hash = `s=${payload}`; }
  };

  const groups = useMemo(() => {
    const g = new Map<string, typeof scenario.fields>();
    for (const f of scenario.fields) g.set(f.group, [...(g.get(f.group) ?? []), f]);
    return [...g.entries()];
  }, [scenario]);

  const choosePack = (id: string) => {
    const p = catalog.find((x) => x.id === id)!;
    setPackId(id); setScenarioId(p.scenarios[0]!.id); setJurisdiction(p.jurisdictions[0]!); setValues({});
  };
  const loadExample = (ex: (typeof scenario.examples)[number]) => { setJurisdiction(ex.jurisdiction); setValues(toFormValues(scenario.fields, ex.inputs)); };
  const set = (path: string, v: string) => setValues((cur) => ({ ...cur, [path]: v }));

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form action={action} className="bg-card space-y-6 self-start rounded-xl border p-6">
        <input type="hidden" name="pack" value={packId} />
        <input type="hidden" name="scenario" value={scenario.id} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="space-y-2"><Label htmlFor="pg-pack">Pack</Label>
            <Select id="pg-pack" value={packId} onChange={(e) => choosePack(e.target.value)}>
              {catalog.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}
            </Select>
          </div>
          {pack.scenarios.length > 1 && (
            <div className="space-y-2"><Label htmlFor="pg-scn">Scenario type</Label>
              <Select id="pg-scn" value={scenario.id} onChange={(e) => { setScenarioId(e.target.value); setValues({}); }}>{pack.scenarios.map((s) => <option key={s.id} value={s.id}>{humanize(s.id)}</option>)}</Select>
            </div>
          )}
          <div className="space-y-2"><Label htmlFor="pg-jur">Jurisdiction</Label>
            <Select id="pg-jur" name="jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>{pack.jurisdictions.map((j) => <option key={j}>{j}</option>)}</Select>
          </div>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{scenario.description}</p>

        {scenario.examples.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Load an example</p>
            <div className="flex flex-wrap gap-2">
              {scenario.examples.map((ex) => (
                <button key={ex.id} type="button" onClick={() => loadExample(ex)} className="hover:border-accent/60 hover:bg-muted/40 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors">
                  {humanize(ex.id)}<span className="text-muted-foreground block font-mono text-[0.625rem]">expects {ex.expectOutcome}</span>
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">Synthetic examples from the pack&apos;s own regression tests.</p>
          </div>
        )}

        {groups.map(([group, fields]) => (
          <fieldset key={group || "root"} className="space-y-4 border-t border-dashed pt-4">
            {group && <legend className="text-muted-foreground -mt-7 bg-card px-2 font-mono text-[0.625rem] tracking-wider uppercase">{humanize(group)}</legend>}
            {fields.map((f) => {
              const id = `f-${f.path}`;
              const v = values[f.path] ?? "";
              return (
                <div key={f.path} className="space-y-1.5">
                  <Label htmlFor={id}>{f.label}{f.required && <span className="text-accent-hover ml-1" aria-label="required">*</span>}</Label>
                  {f.kind === "multi" ? (
                    <div id={id} role="group" aria-label={f.label} className="space-y-1.5">
                      <input type="hidden" name={`f:${f.path}`} value={v} />
                      {f.options!.map((o) => {
                        const chosen = v.split(",").filter(Boolean);
                        const on = chosen.includes(o);
                        return (
                          <label key={o} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={on} onChange={() => set(f.path, (on ? chosen.filter((x) => x !== o) : [...chosen, o]).join(","))} />
                            {humanize(o)}
                          </label>
                        );
                      })}
                    </div>
                  ) : f.kind === "enum" || f.kind === "boolean" ? (
                    <Select id={id} name={`f:${f.path}`} value={v} onChange={(e) => set(f.path, e.target.value)}>
                      <option value="">{f.required ? "Choose..." : "Not provided"}</option>
                      {f.kind === "boolean" ? (<><option value="true">Yes</option><option value="false">No</option></>) : f.options!.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
                    </Select>
                  ) : (
                    <Input id={id} name={`f:${f.path}`} value={v} onChange={(e) => set(f.path, e.target.value)} type={f.kind === "string" ? "text" : "number"} min={f.min} step={f.kind === "integer" ? 1 : "any"} />
                  )}
                  {f.description && <p className="text-muted-foreground text-xs leading-relaxed">{f.description}</p>}
                </div>
              );
            })}
          </fieldset>
        ))}
        <details className="border-t border-dashed pt-4" open={Boolean(asOf || compareAsOf || reference)}>
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">Dates and reference</summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-2"><Label htmlFor="pg-asof">Rules as of</Label><Input id="pg-asof" name="as_of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /><p className="text-muted-foreground text-xs">Leave empty for today. Evaluates the rules by their effective dates.</p></div>
            <div className="space-y-2"><Label htmlFor="pg-cmp">Compare with another date</Label><Input id="pg-cmp" name="compare_as_of" type="date" value={compareAsOf} onChange={(e) => setCompareAsOf(e.target.value)} /><p className="text-muted-foreground text-xs">Runs the same facts on a second date and shows which rules differ.</p></div>
            <div className="space-y-2"><Label htmlFor="pg-ref">Your reference</Label><Input id="pg-ref" name="reference" maxLength={200} placeholder="e.g. matter-1042" value={reference} onChange={(e) => setReference(e.target.value)} /><p className="text-muted-foreground text-xs">Appears in the sample code. Never put personal information here.</p></div>
          </div>
        </details>
        <div className="flex gap-2">
          <Button type="submit" variant="brand" size="lg" disabled={pending} className="flex-1"><Play className="size-4" aria-hidden />{pending ? "Running..." : "Run assessment"}</Button>
          <Button type="button" variant="outline" size="lg" onClick={copyLink} title="Copy a link that reopens these facts"><Link2 className="size-4" aria-hidden />{linkCopied ? "Copied" : "Share"}</Button>
        </div>
        {history.length > 0 && (
          <div className="border-t border-dashed pt-4">
            <p className="text-muted-foreground mb-2 flex items-center gap-1.5 font-mono text-[0.625rem] tracking-wider uppercase"><History className="size-3" aria-hidden />Recent runs</p>
            <ul className="space-y-1">
              {history.map((r) => <li key={r.at}><button type="button" onClick={() => reopen(r)} className="hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs"><span className="truncate">{r.pack} · {r.jurisdiction}{r.asOf ? ` · ${r.asOf}` : ""}</span><span className="text-muted-foreground shrink-0">{humanize(r.outcome)}</span></button></li>)}
            </ul>
          </div>
        )}
      </form>

      <div className="min-w-0">
        {state === null && (
          <div className="text-muted-foreground flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm">
            <p>Pick a pack, load an example or fill in the facts, then run it. The result shows the outcome, what to do, and the rule and source behind each reason.</p>
          </div>
        )}
        {state?.ok === false && <Notice tone="error">{state.message}</Notice>}
        {state?.ok && <AssessmentResult core={state.core} request={state.request} outcomes={scenario.outcomes} notTriggered={state.notTriggered} compare={state.compare} />}
      </div>
    </div>
  );
}

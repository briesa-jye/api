"use client";

import { ArrowLeft, CornerDownLeft, ExternalLink, FlaskConical, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { runCheckAction } from "@/app/check/actions";
import { AssessmentResult, type Core } from "@/components/dashboard/AssessmentResult";
import { Control } from "@/components/dashboard/FieldControl";
import { Input, Label, Notice } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { missingRequired, type LivePack, type Values } from "@/lib/playground-engine";
import { buildInputs, toFormValues } from "@/lib/schema-fields";
import { humanize } from "@/lib/text";

const LAST = "briesa.quickcheck.last.v1";
type Done = { requestId: string; core: Core; test: boolean; reference: string | null };

export function QuickCheck({ catalog }: { catalog: LivePack[] }) {
  const options = useMemo(() => catalog.flatMap((p) => p.scenarios.map((s) => ({ value: `${p.id}/${s.id}`, label: `${p.name}${p.scenarios.length > 1 ? `: ${humanize(s.id)}` : ""}`, hint: `${p.status} · ${s.description}` }))), [catalog]);
  const [which, setWhich] = useState(options[0]!.value);
  const [jurisdiction, setJurisdiction] = useState("");
  const [values, setValues] = useState<Values>({});
  const [reference, setReference] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [ready, setReady] = useState(false);

  const [packId, scenarioId] = which.split("/") as [string, string];
  const pack = catalog.find((p) => p.id === packId) ?? catalog[0]!;
  const scenario = pack.scenarios.find((s) => s.id === scenarioId) ?? pack.scenarios[0]!;
  // "AU" only means "every state" inside a pack. A person checking a matter is in one state or territory.
  const states = pack.jurisdictions.filter((j) => j !== "AU");
  const jur = states.includes(jurisdiction) ? jurisdiction : states[0] ?? pack.jurisdictions[0]!;
  const [exampleAt, setExampleAt] = useState(0);
  const missing = missingRequired(scenario.fields, values);

  // Remember the last check and state, so the tool opens where the person left off.
  useEffect(() => {
    try {
      const l = JSON.parse(localStorage.getItem(LAST) ?? "null") as { which?: string; jurisdiction?: string } | null;
      if (l?.which && options.some((o) => o.value === l.which)) setWhich(l.which);
      if (l?.jurisdiction) setJurisdiction(l.jurisdiction);
    } catch { /* storage blocked: it just opens on the first check */ }
    setReady(true);
  }, [options]);
  useEffect(() => { if (ready) try { localStorage.setItem(LAST, JSON.stringify({ which, jurisdiction: jur })); } catch { /* not kept */ } }, [ready, which, jur]);

  const run = () => {
    if (busy || missing.length > 0) return;
    setError(null);
    start(async () => {
      const r = await runCheckAction({ pack: pack.id, scenario_type: scenario.id, jurisdiction: jur, inputs: buildInputs(scenario.fields, values), ...(reference.trim() && { reference: reference.trim() }) });
      if (!r.ok) { setError(r.error); return; }
      window.scrollTo({ top: 0 });
      setDone({ requestId: r.result.request_id, core: r.result as unknown as Core, test: r.result.test_mode === true, reference: (r.result.reference as string | null) ?? null });
    });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !done) { e.preventDefault(); run(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Fills the form from one of the pack's own worked examples, one after another, so the tool can be tried in a click.
  const fillExample = () => {
    const ex = scenario.examples[exampleAt % Math.max(1, scenario.examples.length)];
    if (!ex) return;
    setValues(toFormValues(scenario.fields, ex.inputs));
    if (states.includes(ex.jurisdiction)) setJurisdiction(ex.jurisdiction);
    setExampleAt((n) => n + 1);
  };
  const reset = () => { setValues({}); setReference(""); setDone(null); setError(null); };

  if (done) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setDone(null)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"><ArrowLeft className="size-4" aria-hidden />Change answers</button>
          <button type="button" onClick={reset} className="bg-accent text-accent-foreground hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"><Plus className="size-4" aria-hidden />New check</button>
        </div>
        <AssessmentResult core={done.core} outcomes={scenario.outcome.order} />
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          Saved to the audit trail as <span className="font-mono">{done.requestId}</span>{done.reference && <> · reference {done.reference}</>}
          <Link href={`/dashboard/audit/${done.requestId}`} target="_blank" className="text-accent-hover inline-flex items-center gap-1 underline underline-offset-4">Open record<ExternalLink className="size-3" aria-hidden /></Link>
        </p>
        {done.test && <Notice>This ran in test mode because your account has no active subscription. It is marked as a test in the audit trail and is not billed.</Notice>}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <div className="space-y-1.5"><Label htmlFor="qc-check">Check</Label><SelectMenu id="qc-check" value={which} onValueChange={(v) => { setWhich(v); setValues({}); setExampleAt(0); }} options={options} /></div>
        <div className="space-y-1.5"><Label htmlFor="qc-state">State</Label><SelectMenu id="qc-state" value={jur} onValueChange={setJurisdiction} options={states.map((j) => ({ value: j, label: j }))} /></div>
      </div>

      {scenario.examples.length > 0 && (
        <button type="button" onClick={fillExample} className="text-accent-hover -mt-2 text-xs underline underline-offset-4">Fill with an example{scenario.examples.length > 1 ? ` (${(exampleAt % scenario.examples.length) + 1} of ${scenario.examples.length})` : ""}</button>
      )}

      <div className="space-y-5">
        {scenario.fields.map((f) => (
          <div key={f.path} className="space-y-1.5">
            <Label htmlFor={`f-${f.path}`}>{f.label}{f.required && <span className="text-accent-hover ml-1" aria-label="required">*</span>}</Label>
            <Control f={f} value={values[f.path] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.path]: v }))} />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="qc-ref">Reference <span className="text-muted-foreground font-normal">(optional, shown in Audit)</span></Label>
        <Input id="qc-ref" maxLength={200} placeholder="Matter or file number. No personal details." value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>

      {error && <Notice tone="error" role="alert">{error}</Notice>}
      {pack.status !== "verified" && <p className="text-muted-foreground flex items-start gap-2 text-xs"><FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />This pack is {pack.status}: its rules have not been fully verified, so treat the result as decision support to check.</p>}

      <div className="bg-background/80 sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t px-1 py-3 backdrop-blur">
        <p className="text-muted-foreground text-xs" aria-live="polite">{missing.length > 0 ? `${missing.length} required ${missing.length === 1 ? "question" : "questions"} left` : "Ready"}</p>
        <button type="submit" disabled={busy || missing.length > 0} className="bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:ring-ring/50 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50">
          {busy ? "Checking..." : "Run check"}<span className="hidden items-center gap-0.5 text-xs opacity-70 sm:flex"><kbd className="font-sans">⌘</kbd><CornerDownLeft className="size-3" aria-hidden /></span>
        </button>
      </div>
    </form>
  );
}

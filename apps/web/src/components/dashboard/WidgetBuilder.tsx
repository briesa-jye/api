"use client";

import { AlertTriangle, Check, Copy, Info, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WidgetPreview } from "@/components/dashboard/WidgetPreview";
import { CodeBlock } from "@/components/site/CodePanel";
import { Chips } from "@/components/ui/chips";
import { Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import type { LivePack } from "@/lib/playground-engine";
import type { Field } from "@/lib/schema-fields";
import { humanize } from "@/lib/text";
import { buildConfig, checkWidget, embedSnippet, emptyQuestion, initialState, type KeyChoice, type QuestionState, type WidgetState } from "@/lib/widget-config";

const DRAFT = "briesa.widget.draft.v1";
const SWATCHES = ["#5170ff", "#0b7a75", "#d95926", "#7c3aed", "#111827"];

const readDraft = (catalog: LivePack[]): WidgetState | null => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as WidgetState | null;
    const pack = catalog.find((p) => p.id === d?.pack);
    if (!d || !pack || !pack.scenarios.some((s) => s.id === d.scenario)) return null;
    return { ...initialState(d.pack, d.scenario), ...d, theme: { ...initialState("", "").theme, ...d.theme }, copy: { ...initialState("", "").copy, ...d.copy }, result: { ...initialState("", "").result, ...d.result } };
  } catch { return null; }
};

export function WidgetBuilder({ catalog, keys, siteUrl, apiUrl }: { catalog: LivePack[]; keys: KeyChoice[]; siteUrl: string; apiUrl: string }) {
  const [state, setState] = useState<WidgetState>(() => initialState(catalog[0]!.id, catalog[0]!.scenarios[0]!.id));
  const [keyId, setKeyId] = useState("");
  const [darkPage, setDarkPage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restored, setRestored] = useState(false);

  // Restore the draft after mount (it lives in this browser only) and keep saving it.
  useEffect(() => { const d = readDraft(catalog); if (d) setState(d); setRestored(true); }, [catalog]);
  useEffect(() => { if (restored) try { localStorage.setItem(DRAFT, JSON.stringify(state)); } catch { /* storage blocked: the draft just is not kept */ } }, [state, restored]);

  const pack = catalog.find((p) => p.id === state.pack)!;
  const scenario = pack.scenarios.find((s) => s.id === state.scenario) ?? pack.scenarios[0]!;
  const usable = keys.filter((k) => k.scopes.includes(`pack:${pack.id}`));
  const key = keys.find((k) => k.id === keyId) ?? usable[0] ?? keys[0] ?? null;
  // Visitors pick a state or territory; "AU" only means "every state" inside a pack.
  const states = useMemo(() => pack.jurisdictions.filter((j) => j !== "AU"), [pack]);
  const config = useMemo(() => buildConfig(state, states), [state, states]);
  const problems = useMemo(() => checkWidget({ state, fields: scenario.fields, packStatus: pack.status, key }), [state, scenario, pack, key]);
  const blocked = problems.some((p) => p.level === "error");
  const snippet = embedSnippet({ siteUrl, apiUrl, key: key?.publicKey ?? "pk_...", config });

  const patch = (p: Partial<WidgetState>) => setState((s) => ({ ...s, ...p }));
  const setQ = (path: string, q: Partial<QuestionState>) => setState((s) => ({ ...s, questions: { ...s.questions, [path]: { ...emptyQuestion(), ...s.questions[path], ...q } } }));
  const choosePack = (id: string) => { const p = catalog.find((x) => x.id === id)!; setState(initialState(id, p.scenarios[0]!.id)); };
  const chooseScenario = (id: string) => setState(initialState(pack.id, id));
  const copy = async () => { try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the snippet is selectable */ } };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      {/* ---------- choices ---------- */}
      <div className="space-y-6">
        <Section n="1" title="What it checks">
          <div className="space-y-2"><Label htmlFor="wb-pack">Pack</Label>
            <SelectMenu id="wb-pack" value={pack.id} onValueChange={choosePack} options={catalog.map((p) => ({ value: p.id, label: p.name, hint: `${p.status} · v${p.version}` }))} />
          </div>
          {pack.scenarios.length > 1 && (
            <div className="space-y-2"><Label htmlFor="wb-scn">Scenario</Label>
              <SelectMenu id="wb-scn" value={scenario.id} onValueChange={chooseScenario} options={pack.scenarios.map((s) => ({ value: s.id, label: humanize(s.id), hint: s.description }))} />
            </div>
          )}
          <div className="space-y-2"><Label>States and territories visitors can pick</Label>
            <Chips aria-label="Jurisdictions" options={states.map((j) => ({ value: j, label: j }))} value={state.jurisdictions} onChange={(v) => patch({ jurisdictions: v })} />
            <p className="text-muted-foreground text-xs">{state.jurisdictions.length === 0 ? "None selected means all of them." : state.jurisdictions.length === 1 ? "With one, visitors are not asked." : "Visitors choose from these."}</p>
          </div>
        </Section>

        <Section n="2" title="Questions">
          <p className="text-muted-foreground text-xs leading-relaxed">Hide a question when you already know the answer, such as a form that is only for work incidents. A hidden question that must be answered needs the answer you want used.</p>
          <ul className="space-y-3">
            {scenario.fields.map((f) => <QuestionCard key={f.path} f={f} q={state.questions[f.path] ?? emptyQuestion()} onChange={(q) => setQ(f.path, q)} />)}
          </ul>
        </Section>

        <Section n="3" title="Look and feel">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="wb-title">Title</Label><Input id="wb-title" maxLength={120} placeholder="e.g. Is this incident notifiable?" value={state.copy.title} onChange={(e) => patch({ copy: { ...state.copy, title: e.target.value } })} /></div>
            <div className="space-y-2"><Label htmlFor="wb-submit">Button text</Label><Input id="wb-submit" maxLength={40} value={state.copy.submit} onChange={(e) => patch({ copy: { ...state.copy, submit: e.target.value } })} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="wb-intro">Intro</Label><Input id="wb-intro" maxLength={400} placeholder="One sentence telling visitors what this does" value={state.copy.intro} onChange={(e) => patch({ copy: { ...state.copy, intro: e.target.value } })} /></div>
          <div className="space-y-2"><Label>Accent colour</Label>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button key={c} type="button" aria-label={`Use ${c}`} aria-pressed={state.theme.accent.toLowerCase() === c} onClick={() => patch({ theme: { ...state.theme, accent: c } })}
                  className="focus-visible:ring-ring/60 size-8 rounded-full border-2 transition-transform outline-none hover:scale-110 focus-visible:ring-2 aria-pressed:ring-2 aria-pressed:ring-offset-2 aria-pressed:ring-offset-[var(--card)] aria-pressed:ring-foreground/70" style={{ background: c, borderColor: "transparent" }} />
              ))}
              <input type="color" aria-label="Pick any colour" value={state.theme.accent} onChange={(e) => patch({ theme: { ...state.theme, accent: e.target.value } })} className="bg-transparent h-8 w-10 cursor-pointer rounded border" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Light or dark</Label>
              <Segmented aria-label="Colour mode" value={state.theme.mode} onValueChange={(v) => v && patch({ theme: { ...state.theme, mode: v as WidgetState["theme"]["mode"] } })} options={[{ value: "auto", label: "Match visitor" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></div>
            <div className="space-y-2"><Label>Corners</Label>
              <Segmented aria-label="Corner style" value={state.theme.radius} onValueChange={(v) => v && patch({ theme: { ...state.theme, radius: v as WidgetState["theme"]["radius"] } })} options={[{ value: "none", label: "Square" }, { value: "sm", label: "Slight" }, { value: "md", label: "Round" }, { value: "lg", label: "Softer" }]} /></div>
          </div>
        </Section>

        <Section n="4" title="Result">
          <Check2 label="Show what to do" hint="The numbered actions from the rules." checked={state.result.actions} onChange={(v) => patch({ result: { ...state.result, actions: v } })} />
          <Check2 label="Show why, with sources" hint="Each rule behind the result, with its legal source." checked={state.result.reasons} onChange={(v) => patch({ result: { ...state.result, reasons: v } })} />
          <Check2 label="Show the pack's built-in help text" hint="Written for developers, so it is usually better to write your own help per question." checked={state.copy.schemaHelp} onChange={(v) => patch({ copy: { ...state.copy, schemaHelp: v } })} />
          <Check2 label={'Show "Powered by Briesa"'} hint="" checked={state.copy.brand} onChange={(v) => patch({ copy: { ...state.copy, brand: v } })} />
          <p className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Always shown, and not switchable: the pack&apos;s maturity (draft, beta or verified), the human review notice and the disclaimer. A result is decision support, never a guarantee of compliance.</p>
        </Section>
      </div>

      {/* ---------- preview and embed ---------- */}
      <div className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        <section className="bg-card rounded-xl border p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base">Live preview</h3>
            <div className="flex items-center gap-2">
              <Segmented aria-label="Preview page colour" value={darkPage ? "dark" : "light"} onValueChange={(v) => v && setDarkPage(v === "dark")} options={[{ value: "light", label: "Light page" }, { value: "dark", label: "Dark page" }]} />
              <button type="button" onClick={() => setState(initialState(pack.id, scenario.id))} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"><RotateCcw className="size-3" aria-hidden />Reset</button>
            </div>
          </div>
          <WidgetPreview pack={pack} scenario={scenario} config={config} dark={darkPage} />
          <p className="text-muted-foreground mt-2 text-xs">This is the real widget, running on the same rules as the API. Try it: fill it in and press the button.</p>
        </section>

        <section className="bg-card space-y-4 rounded-xl border p-5">
          <h3 className="font-display text-base">Add it to your site</h3>
          <div className="space-y-2"><Label htmlFor="wb-key">Publishable key</Label>
            {keys.length === 0 ? (
              <p className="text-muted-foreground text-sm">You have no publishable keys yet. <Link href="/dashboard/keys" className="text-accent-hover underline underline-offset-4">Create one</Link> and list your site; then come back here.</p>
            ) : (
              <SelectMenu id="wb-key" value={key?.id ?? ""} onValueChange={setKeyId}
                options={keys.map((k) => ({ value: k.id, label: `${k.name} (${k.mode})`, hint: k.allowedOrigins.join(", ") || "no allowed sites" }))} />
            )}
          </div>
          {problems.length > 0 && (
            <ul className="space-y-1.5" aria-label="Checks">
              {problems.map((p, i) => (
                <li key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${p.level === "error" ? "bg-destructive/10" : "bg-muted/40 text-muted-foreground"}`}>
                  {p.level === "error" ? <AlertTriangle className="text-destructive mt-0.5 size-3.5 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />}{p.message}
                </li>
              ))}
            </ul>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Paste this where the widget should appear</p>
              <button type="button" onClick={copy} disabled={blocked} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs disabled:opacity-50">{copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}</button>
            </div>
            <CodeBlock code={snippet} />
            {blocked && <p className="text-destructive mt-2 text-xs">Fix the errors above before you copy this.</p>}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">The widget needs no other code, and your page&apos;s styles cannot change how it looks. It fires <span className="font-mono">briesa:result</span> on the page when someone gets a result, so you can send it on to your own systems. Results can also reach you through <Link href="/dashboard/webhooks" className="text-accent-hover underline underline-offset-4">webhooks</Link>.</p>
        </section>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card space-y-5 rounded-xl border p-6">
      <h2 className="font-display flex items-center gap-3 text-lg"><span className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full font-mono text-xs">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

function Check2({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent mt-1" />
      <span>{label}{hint && <span className="text-muted-foreground block text-xs">{hint}</span>}</span>
    </label>
  );
}

function QuestionCard({ f, q, onChange }: { f: Field; q: QuestionState; onChange: (q: Partial<QuestionState>) => void }) {
  const stuck = f.required && !q.show && !q.value;
  return (
    <li className={`rounded-lg border p-4 ${stuck ? "border-destructive/60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-sm font-medium">{f.label}{f.required && <span className="text-accent-hover ml-1" aria-label="required">*</span>}</p><p className="text-muted-foreground truncate font-mono text-[0.6875rem]">{f.path}</p></div>
        <Segmented aria-label={`Show ${f.label}`} value={q.show ? "show" : "hide"} onValueChange={(v) => v && onChange({ show: v === "show" })} options={[{ value: "show", label: "Show" }, { value: "hide", label: "Hide" }]} />
      </div>
      {q.show ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`wq-l-${f.path}`} className="text-xs">Your wording</Label><Input id={`wq-l-${f.path}`} maxLength={120} placeholder={f.label} value={q.label} onChange={(e) => onChange({ label: e.target.value })} className="h-9 text-sm" /></div>
          <div className="space-y-1.5"><Label htmlFor={`wq-h-${f.path}`} className="text-xs">Help text</Label><Input id={`wq-h-${f.path}`} maxLength={300} placeholder="Optional" value={q.help} onChange={(e) => onChange({ help: e.target.value })} className="h-9 text-sm" /></div>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <Label className="text-xs">{f.required ? "Answer to use (required)" : "Answer to use (optional)"}</Label>
          <Answer f={f} value={q.value} onChange={(v) => onChange({ value: v })} />
          {stuck && <p className="text-destructive text-xs">This question must be answered, so choose the answer to use or show it.</p>}
        </div>
      )}
    </li>
  );
}

/** Picks the fixed answer for a hidden question, in the control that suits its kind. */
function Answer({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  if (f.kind === "boolean") return <Segmented aria-label={f.label} value={value} onValueChange={onChange} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />;
  if (f.kind === "multi") return <Chips aria-label={f.label} options={f.options!.map((o) => ({ value: o, label: humanize(o) }))} value={value.split(",").filter(Boolean)} onChange={(v) => onChange(v.join(","))} />;
  if (f.kind === "enum") return <SelectMenu value={value} onValueChange={onChange} options={f.options!.map((o) => ({ value: o, label: humanize(o) }))} placeholder="Choose..." emptyLabel={f.required ? undefined : "Leave unanswered"} />;
  return <Input value={value} onChange={(e) => onChange(e.target.value)} type={f.kind === "string" ? "text" : "number"} className="h-9 text-sm" />;
}

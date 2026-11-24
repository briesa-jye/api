"use client";

import { AlertTriangle, Check, ChevronDown, Code2, Copy, Eye, EyeOff, Info, ListChecks, Palette, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Tabs } from "radix-ui";
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
import { buildConfig, checkWidget, DEFAULT_THEME, embedSnippet, emptyQuestion, initialState, PRESETS, type KeyChoice, type QuestionState, type Theme, type WidgetState } from "@/lib/widget-config";

const DRAFT = "briesa.widget.draft.v2";
const SWATCHES = ["#5170ff", "#0b7a75", "#d95926", "#7c3aed", "#e11d48", "#111827"];
const RADII = { none: "0px", sm: "6px", md: "10px", lg: "16px" } as const;
const FONTS = { system: "system-ui, sans-serif", serif: "Georgia, serif", rounded: "ui-rounded, system-ui, sans-serif", mono: "ui-monospace, Menlo, monospace" } as const;

const readDraft = (catalog: LivePack[]): WidgetState | null => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as WidgetState | null;
    const pack = catalog.find((p) => p.id === d?.pack);
    if (!d || !pack || !pack.scenarios.some((s) => s.id === d.scenario)) return null;
    const base = initialState(d.pack, d.scenario);
    return { ...base, ...d, theme: { ...base.theme, ...d.theme }, copy: { ...base.copy, ...d.copy }, result: { ...base.result, ...d.result } };
  } catch { return null; }
};

type Panel = "content" | "style" | "embed";

export function WidgetBuilder({ catalog, keys, siteUrl, apiUrl }: { catalog: LivePack[]; keys: KeyChoice[]; siteUrl: string; apiUrl: string }) {
  const [state, setState] = useState<WidgetState>(() => initialState(catalog[0]!.id, catalog[0]!.scenarios[0]!.id));
  const [panel, setPanel] = useState<Panel>("content");
  const [keyId, setKeyId] = useState("");
  const [darkPage, setDarkPage] = useState(false);
  const [phone, setPhone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restored, setRestored] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

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
  const t = state.theme;

  const patch = (p: Partial<WidgetState>) => setState((s) => ({ ...s, ...p }));
  const setTheme = (p: Partial<Theme>) => setState((s) => ({ ...s, theme: { ...s.theme, ...p } }));
  const setCopy = (p: Partial<WidgetState["copy"]>) => setState((s) => ({ ...s, copy: { ...s.copy, ...p } }));
  const setQ = (path: string, q: Partial<QuestionState>) => setState((s) => ({ ...s, questions: { ...s.questions, [path]: { ...emptyQuestion(), ...s.questions[path], ...q } } }));
  // Switching what the widget checks keeps the look you chose; the questions and wording belong to the old check, so they start fresh.
  const choosePack = (id: string) => { const p = catalog.find((x) => x.id === id)!; setState((s) => ({ ...initialState(id, p.scenarios[0]!.id), theme: s.theme })); setOpen(null); };
  const chooseScenario = (id: string) => { setState((s) => ({ ...initialState(pack.id, id), theme: s.theme })); setOpen(null); };
  const copySnippet = async () => { try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked: the snippet is selectable */ } };
  const shown = scenario.fields.filter((f) => (state.questions[f.path] ?? emptyQuestion()).show).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
      {/* ---------- controls: three short tabs ---------- */}
      <Tabs.Root value={panel} onValueChange={(v) => setPanel(v as Panel)} className="bg-card min-w-0 self-start overflow-hidden rounded-2xl border">
        <Tabs.List aria-label="Widget settings" className="bg-muted/30 grid grid-cols-3 gap-1 border-b p-1.5">
          {([["content", "Content", ListChecks], ["style", "Style", Palette], ["embed", "Embed", Code2]] as const).map(([id, label, Icon]) => (
            <Tabs.Trigger key={id} value={id} className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 data-[state=active]:bg-card data-[state=active]:text-foreground relative flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 data-[state=active]:shadow-sm">
              <Icon className="size-4" aria-hidden />{label}
              {id === "embed" && blocked && <span className="bg-destructive absolute top-1.5 right-2.5 size-1.5 rounded-full" role="img" aria-label="needs attention" />}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ----- content ----- */}
        <Tabs.Content value="content" className="space-y-7 p-5 outline-none">
          <Group title="What it checks">
            <SelectMenu id="wb-pack" aria-label="Pack" value={pack.id} onValueChange={choosePack} options={catalog.map((p) => ({ value: p.id, label: p.name, hint: `${p.status} · v${p.version}` }))} />
            {pack.scenarios.length > 1 && <SelectMenu id="wb-scn" aria-label="Scenario" value={scenario.id} onValueChange={chooseScenario} options={pack.scenarios.map((s) => ({ value: s.id, label: humanize(s.id), hint: s.description }))} />}
          </Group>

          <Group title="Words">
            <Input aria-label="Title" maxLength={120} placeholder="Title, e.g. Is this incident notifiable?" value={state.copy.title} onChange={(e) => setCopy({ title: e.target.value })} />
            <Input aria-label="Intro" maxLength={400} placeholder="One line telling visitors what this does" value={state.copy.intro} onChange={(e) => setCopy({ intro: e.target.value })} />
            <Input aria-label="Button text" maxLength={40} placeholder="Button text" value={state.copy.submit} onChange={(e) => setCopy({ submit: e.target.value })} />
          </Group>

          <Group title="Questions" aside={`${shown} of ${scenario.fields.length} shown`}>
            <ul className="space-y-1.5">
              {scenario.fields.map((f) => <QuestionRow key={f.path} f={f} q={state.questions[f.path] ?? emptyQuestion()} expanded={open === f.path} onToggle={() => setOpen(open === f.path ? null : f.path)} onChange={(q) => setQ(f.path, q)} />)}
            </ul>
            <p className="text-muted-foreground text-xs">Hide a question you already know the answer to. Open one to reword it or add help.</p>
          </Group>

          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex cursor-pointer list-none items-center justify-between rounded-lg text-sm font-medium outline-none focus-visible:ring-2">
              More options <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-4 space-y-5">
              <div className="space-y-2"><Label>States and territories visitors can pick</Label>
                <Chips aria-label="Jurisdictions" options={states.map((j) => ({ value: j, label: j }))} value={state.jurisdictions} onChange={(v) => patch({ jurisdictions: v })} />
                <p className="text-muted-foreground text-xs">{state.jurisdictions.length === 0 ? "None selected means all of them." : state.jurisdictions.length === 1 ? "With one, visitors are not asked." : "Visitors choose from these."}</p>
              </div>
              <div className="space-y-3">
                <Toggle label="Show what to do" checked={state.result.actions} onChange={(v) => patch({ result: { ...state.result, actions: v } })} />
                <Toggle label="Show why, with sources" checked={state.result.reasons} onChange={(v) => patch({ result: { ...state.result, reasons: v } })} />
                <Toggle label="Show the pack's built-in help text" hint="Written for developers; your own help text per question is usually better." checked={state.copy.schemaHelp} onChange={(v) => setCopy({ schemaHelp: v })} />
                <Toggle label={'Show "Powered by Briesa"'} checked={state.copy.brand} onChange={(v) => setCopy({ brand: v })} />
              </div>
              <p className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Always shown: the pack&apos;s maturity (draft, beta or verified), the human review notice and the disclaimer.</p>
            </div>
          </details>
        </Tabs.Content>

        {/* ----- style ----- */}
        <Tabs.Content value="style" className="space-y-7 p-5 outline-none">
          <Group title="Starting look">
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => <PresetCard key={p.id} name={p.name} theme={p.theme} active={JSON.stringify({ ...DEFAULT_THEME, ...t }) === JSON.stringify(p.theme)} onPick={() => setTheme(p.theme)} />)}
            </div>
          </Group>

          <Group title="Colour">
            <Row label="Accent">
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={`Use ${c}`} aria-pressed={t.accent.toLowerCase() === c} onClick={() => setTheme({ accent: c })}
                    className="focus-visible:ring-ring/60 aria-pressed:ring-foreground/70 size-7 rounded-full transition-transform outline-none hover:scale-110 focus-visible:ring-2 aria-pressed:ring-2 aria-pressed:ring-offset-2 aria-pressed:ring-offset-[var(--card)]" style={{ background: c }} />
                ))}
                <input type="color" aria-label="Pick any accent colour" value={t.accent} onChange={(e) => setTheme({ accent: e.target.value })} className="h-7 w-9 cursor-pointer rounded border bg-transparent" />
              </div>
            </Row>
            <Row label="Light or dark">
              <Segmented aria-label="Colour mode" value={t.mode} onValueChange={(v) => v && setTheme({ mode: v as Theme["mode"] })} options={[{ value: "auto", label: "Match visitor" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
            </Row>
            <div className="grid grid-cols-2 gap-4">
              <ColourField label="Background" value={t.background} onChange={(v) => setTheme({ background: v })} />
              <ColourField label="Text" value={t.text} onChange={(v) => setTheme({ text: v })} />
            </div>
          </Group>

          <Group title="Shape and type">
            <Row label="Corners"><Segmented aria-label="Corner style" value={t.radius} onValueChange={(v) => v && setTheme({ radius: v as Theme["radius"] })} options={[{ value: "none", label: "Square" }, { value: "sm", label: "Slight" }, { value: "md", label: "Round" }, { value: "lg", label: "Softer" }]} /></Row>
            <Row label="Font"><Segmented aria-label="Font" value={t.font} onValueChange={(v) => v && setTheme({ font: v as Theme["font"] })} options={[{ value: "system", label: "Sans" }, { value: "serif", label: "Serif" }, { value: "rounded", label: "Rounded" }, { value: "mono", label: "Mono" }]} /></Row>
            <Row label="Text size"><Segmented aria-label="Text size" value={t.size} onValueChange={(v) => v && setTheme({ size: v as Theme["size"] })} options={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }]} /></Row>
          </Group>

          <Group title="Layout">
            <Row label="Width"><Segmented aria-label="Width" value={t.width} onValueChange={(v) => v && setTheme({ width: v as Theme["width"] })} options={[{ value: "narrow", label: "Narrow" }, { value: "medium", label: "Medium" }, { value: "full", label: "Full" }]} /></Row>
            <Row label="Spacing"><Segmented aria-label="Spacing" value={t.density} onValueChange={(v) => v && setTheme({ density: v as Theme["density"] })} options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfy" }, { value: "spacious", label: "Airy" }]} /></Row>
            <Row label="Frame"><Segmented aria-label="Frame" value={t.surface} onValueChange={(v) => v && setTheme({ surface: v as Theme["surface"] })} options={[{ value: "card", label: "Outlined" }, { value: "raised", label: "Raised" }, { value: "flat", label: "None" }]} /></Row>
          </Group>

          <Group title="Inputs and button">
            <Row label="Fields"><Segmented aria-label="Field style" value={t.field} onValueChange={(v) => v && setTheme({ field: v as Theme["field"] })} options={[{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }, { value: "underline", label: "Underline" }]} /></Row>
            <Row label="Button"><Segmented aria-label="Button style" value={t.button} onValueChange={(v) => v && setTheme({ button: v as Theme["button"] })} options={[{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }, { value: "soft", label: "Soft" }]} /></Row>
            <Toggle label="Full-width button" checked={t.buttonFull} onChange={(v) => setTheme({ buttonFull: v })} />
          </Group>
        </Tabs.Content>

        {/* ----- embed ----- */}
        <Tabs.Content value="embed" className="space-y-5 p-5 outline-none">
          <Group title="Publishable key">
            {keys.length === 0 ? (
              <p className="text-muted-foreground text-sm">You have no publishable keys yet. <Link href="/dashboard/keys" className="text-accent-hover underline underline-offset-4">Create one</Link> and list your site; then come back here.</p>
            ) : (
              <SelectMenu id="wb-key" aria-label="Publishable key" value={key?.id ?? ""} onValueChange={setKeyId}
                options={keys.map((k) => ({ value: k.id, label: `${k.name} (${k.mode})`, hint: k.allowedOrigins.join(", ") || "no allowed sites" }))} />
            )}
          </Group>
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
              <p className="text-sm font-medium">Paste where the widget should appear</p>
              <button type="button" onClick={copySnippet} disabled={blocked} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs disabled:opacity-50">{copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}</button>
            </div>
            <CodeBlock code={snippet} />
            {blocked && <p className="text-destructive mt-2 text-xs">Fix the errors above before you copy this.</p>}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">No other code is needed, and your page&apos;s styles cannot change how the widget looks. It fires <span className="font-mono">briesa:result</span> on the page when someone gets a result. Results can also reach you through <Link href="/dashboard/webhooks" className="text-accent-hover underline underline-offset-4">webhooks</Link>.</p>
        </Tabs.Content>
      </Tabs.Root>

      {/* ---------- live preview ---------- */}
      <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <div className="bg-card overflow-hidden rounded-2xl border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented aria-label="Preview size" value={phone ? "phone" : "desktop"} onValueChange={(v) => v && setPhone(v === "phone")} options={[{ value: "desktop", label: "Desktop" }, { value: "phone", label: "Phone" }]} />
              <Segmented aria-label="Preview page colour" value={darkPage ? "dark" : "light"} onValueChange={(v) => v && setDarkPage(v === "dark")} options={[{ value: "light", label: "Light page" }, { value: "dark", label: "Dark page" }]} />
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setState((s) => initialState(s.pack, s.scenario))} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"><RotateCcw className="size-3" aria-hidden />Reset</button>
              <button type="button" onClick={() => setPanel("embed")} className="bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2"><Code2 className="size-4" aria-hidden />Get code</button>
            </div>
          </div>
          <div className={`p-4 transition-colors sm:p-8 ${darkPage ? "bg-[#0b0b0f]" : "bg-[#f3f4f7]"}`}>
            <div className={`mx-auto transition-all ${phone ? "max-w-[375px]" : ""}`}>
              <WidgetPreview pack={pack} scenario={scenario} config={config} />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">This is the real widget running on the real rules. Fill it in and press the button.</p>
      </div>
    </div>
  );
}

function Group({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between"><h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{title}</h3>{aside && <span className="text-muted-foreground text-xs">{aside}</span>}</div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><p className="text-sm">{label}</p>{children}</div>;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
      <span>{label}{hint && <span className="text-muted-foreground block text-xs">{hint}</span>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="bg-muted checked:bg-accent focus-visible:ring-ring/50 relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full transition-colors outline-none before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4 focus-visible:ring-2" />
    </label>
  );
}

/** A colour that may be left on automatic. */
function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm">{label}</p>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} colour`} value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent" />
        {value ? <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4">Auto</button> : <span className="text-muted-foreground text-xs">Auto</span>}
      </div>
    </div>
  );
}

/** A small picture of a look: its background, a line of text in its font, and a button in its accent and corners. */
function PresetCard({ name, theme, active, onPick }: { name: string; theme: Theme; active: boolean; onPick: () => void }) {
  const dark = theme.mode === "dark";
  const bg = theme.background || (dark ? "#17171c" : "#ffffff");
  const fg = theme.text || (dark ? "#f1f1f4" : "#14141a");
  const r = RADII[theme.radius];
  const fieldStyle = theme.field === "underline" ? { borderBottom: `2px solid ${fg}33` } : { border: `1px solid ${fg}33`, background: theme.field === "outline" ? "transparent" : `${fg}0d`, borderRadius: r };
  return (
    <button type="button" onClick={onPick} aria-pressed={active} aria-label={`${name} look`}
      className="focus-visible:ring-ring/50 group aria-pressed:border-accent aria-pressed:ring-accent/40 hover:border-foreground/30 rounded-xl border p-1.5 text-left transition-all outline-none focus-visible:ring-2 aria-pressed:ring-2">
      <div className="space-y-1.5 p-2" style={{ background: bg, color: fg, borderRadius: `calc(${r} * 0.8)`, fontFamily: FONTS[theme.font], boxShadow: theme.surface === "raised" ? "0 6px 14px -6px #0006" : undefined, border: theme.surface === "card" ? `1px solid ${fg}26` : "1px solid transparent" }}>
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: fg, opacity: 0.8 }} />
        <div className="h-3.5" style={fieldStyle} />
        <div className="h-3.5" style={{ background: theme.button === "solid" ? theme.accent : "transparent", border: `1.5px solid ${theme.accent}`, borderRadius: r, width: theme.buttonFull ? "100%" : "50%" }} />
      </div>
      <p className="text-muted-foreground group-aria-pressed:text-foreground mt-1.5 px-0.5 text-xs font-medium">{name}</p>
    </button>
  );
}

function QuestionRow({ f, q, expanded, onToggle, onChange }: { f: Field; q: QuestionState; expanded: boolean; onToggle: () => void; onChange: (q: Partial<QuestionState>) => void }) {
  const stuck = f.required && !q.show && !q.value;
  return (
    <li className={`rounded-xl border ${stuck ? "border-destructive/60" : ""} ${q.show ? "" : "bg-muted/20"}`}>
      <div className="flex items-center gap-1 pr-1.5">
        <button type="button" onClick={() => onChange({ show: !q.show })} aria-pressed={q.show} aria-label={`${q.show ? "Hide" : "Show"} ${f.label}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 m-1 rounded-lg p-2 transition-colors outline-none focus-visible:ring-2">
          {q.show ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        </button>
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg py-2.5 text-left text-sm outline-none focus-visible:ring-2">
          <span className={`truncate ${q.show ? "" : "text-muted-foreground line-through"}`}>{q.label.trim() || f.label}{f.required && <span className="text-accent-hover ml-1" aria-label="required">*</span>}</span>
          <ChevronDown className={`text-muted-foreground size-4 shrink-0 transition-transform ${expanded || stuck ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>
      {(expanded || stuck) && (
        <div className="space-y-3 border-t p-3">
          {q.show ? (
            <>
              <Input aria-label={`Wording for ${f.label}`} maxLength={120} placeholder={f.label} value={q.label} onChange={(e) => onChange({ label: e.target.value })} className="h-9 text-sm" />
              <Input aria-label={`Help text for ${f.label}`} maxLength={300} placeholder="Help text (optional)" value={q.help} onChange={(e) => onChange({ help: e.target.value })} className="h-9 text-sm" />
            </>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">{f.required ? "Answer to use (required)" : "Answer to use (optional)"}</Label>
              <Answer f={f} value={q.value} onChange={(v) => onChange({ value: v })} />
              {stuck && <p className="text-destructive text-xs">This question must be answered, so choose the answer to use or show it.</p>}
            </div>
          )}
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

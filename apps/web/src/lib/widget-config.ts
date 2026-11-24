import type { Field } from "./schema-fields.ts";

// Pure and browser-safe: turns the builder's choices into the config the widget reads, and into the HTML snippet to paste.

export const DEFAULT_ACCENT = "#5170ff";

export interface QuestionState { show: boolean; label: string; help: string; value: string }
export interface WidgetState {
  pack: string;
  scenario: string;
  /** Empty means every jurisdiction the pack covers. */
  jurisdictions: string[];
  questions: Record<string, QuestionState>;
  theme: Theme;
  copy: { title: string; intro: string; submit: string; brand: boolean; schemaHelp: boolean };
  result: { actions: boolean; reasons: boolean };
}

export interface Theme {
  accent: string;
  mode: "auto" | "light" | "dark";
  radius: "none" | "sm" | "md" | "lg";
  font: "system" | "serif" | "rounded" | "mono";
  size: "sm" | "md" | "lg";
  density: "compact" | "comfortable" | "spacious";
  surface: "card" | "flat" | "raised";
  field: "filled" | "outline" | "underline";
  button: "solid" | "outline" | "soft";
  /** The submit button spans the whole width. */
  buttonFull: boolean;
  width: "narrow" | "medium" | "full";
  /** Empty means automatic. */
  background: string;
  text: string;
}

export const DEFAULT_THEME: Theme = {
  accent: DEFAULT_ACCENT, mode: "auto", radius: "md", font: "system", size: "md", density: "comfortable", surface: "card",
  field: "filled", button: "solid", buttonFull: false, width: "medium", background: "", text: "",
};

/** One-click starting looks. Each is a complete theme, so choosing one replaces every appearance setting. */
export const PRESETS: { id: string; name: string; theme: Theme }[] = [
  { id: "clean", name: "Clean", theme: DEFAULT_THEME },
  { id: "midnight", name: "Midnight", theme: { ...DEFAULT_THEME, accent: "#8b9cff", mode: "dark", radius: "lg", surface: "raised" } },
  { id: "paper", name: "Paper", theme: { ...DEFAULT_THEME, accent: "#8a4b2a", mode: "light", radius: "sm", font: "serif", field: "underline", button: "outline", background: "#faf6ee", text: "#2b2118" } },
  { id: "mint", name: "Mint", theme: { ...DEFAULT_THEME, accent: "#0b7a75", mode: "light", radius: "lg", font: "rounded", surface: "flat", background: "#eef8f6" } },
  { id: "bold", name: "Bold", theme: { ...DEFAULT_THEME, accent: "#d95926", radius: "none", size: "lg", density: "spacious", field: "outline", buttonFull: true } },
  { id: "mono", name: "Mono", theme: { ...DEFAULT_THEME, accent: "#111827", mode: "light", radius: "none", font: "mono", field: "outline", button: "outline", surface: "card", size: "sm" } },
];

export const emptyQuestion = (): QuestionState => ({ show: true, label: "", help: "", value: "" });

export function initialState(pack: string, scenario: string): WidgetState {
  return {
    pack, scenario, jurisdictions: [], questions: {},
    theme: { ...DEFAULT_THEME },
    copy: { title: "", intro: "", submit: "Check", brand: true, schemaHelp: false },
    result: { actions: true, reasons: true },
  };
}

/** The config JSON for the widget. Only what differs from the widget's own defaults is written, so the snippet stays short. */
export function buildConfig(s: WidgetState, allJurisdictions: string[]): Record<string, unknown> {
  const c: Record<string, unknown> = { pack: s.pack, scenario: s.scenario };
  const chosen = s.jurisdictions.filter((j) => allJurisdictions.includes(j));
  if (chosen.length > 0 && chosen.length < allJurisdictions.length) c.jurisdictions = chosen;
  const questions: Record<string, Partial<QuestionState>> = {};
  for (const [path, q] of Object.entries(s.questions)) {
    const o: Partial<QuestionState> = {};
    if (!q.show) { o.show = false; if (q.value) o.value = q.value; }
    else { if (q.label.trim()) o.label = q.label.trim(); if (q.help.trim()) o.help = q.help.trim(); }
    if (Object.keys(o).length) questions[path] = o;
  }
  if (Object.keys(questions).length) c.questions = questions;
  const theme: Record<string, string> = {};
  const t = { ...DEFAULT_THEME, ...s.theme };
  for (const k of ["mode", "radius", "font", "size", "density", "surface", "field", "button", "width"] as const) {
    if (t[k] !== DEFAULT_THEME[k]) theme[k] = t[k];
  }
  if (t.accent.toLowerCase() !== DEFAULT_ACCENT) theme.accent = t.accent;
  if (t.buttonFull) theme.buttonWidth = "full";
  if (t.background) theme.background = t.background;
  if (t.text) theme.text = t.text;
  if (Object.keys(theme).length) c.theme = theme;
  const copy: Record<string, string | boolean> = {};
  if (s.copy.title.trim()) copy.title = s.copy.title.trim();
  if (s.copy.intro.trim()) copy.intro = s.copy.intro.trim();
  if (s.copy.submit.trim() && s.copy.submit.trim() !== "Check") copy.submit = s.copy.submit.trim();
  if (!s.copy.brand) copy.brand = false;
  if (s.copy.schemaHelp) copy.schemaHelp = true;
  if (Object.keys(copy).length) c.copy = copy;
  const result: Record<string, boolean> = {};
  if (!s.result.actions) result.actions = false;
  if (!s.result.reasons) result.reasons = false;
  if (Object.keys(result).length) c.result = result;
  return c;
}

/** Escapes text for a double-quoted HTML attribute. */
export const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function embedSnippet(o: { siteUrl: string; apiUrl: string; key: string; config: Record<string, unknown> }): string {
  const site = o.siteUrl.replace(/\/+$/, "");
  return `<script src="${site}/widget/v1.js" async\n  data-briesa-key="${escapeAttr(o.key)}"\n  data-briesa-api="${escapeAttr(o.apiUrl.replace(/\/+$/, ""))}"\n  data-briesa-config="${escapeAttr(JSON.stringify(o.config))}"></script>`;
}

export interface Problem { level: "error" | "warn" | "info"; message: string }

export interface KeyChoice { id: string; name: string; mode: "test" | "live"; publicKey: string; allowedOrigins: string[]; scopes: string[] }

/** What would stop the widget working, or surprise the person pasting it. Errors mean the widget will not work as built. */
export function checkWidget(o: { state: WidgetState; fields: Field[]; packStatus: string; key: KeyChoice | null }): Problem[] {
  const out: Problem[] = [];
  const { state, fields, key } = o;
  for (const f of fields) {
    const q = state.questions[f.path];
    if (f.required && q && !q.show && !q.value) out.push({ level: "error", message: `"${f.label}" is required but hidden with no answer. Show it, or choose the answer to use.` });
  }
  if (!key) out.push({ level: "error", message: "Choose a publishable key, or create one under API keys. The widget cannot run without it." });
  else {
    if (!key.scopes.includes(`pack:${state.pack}`)) out.push({ level: "error", message: `The key "${key.name}" does not include this pack. Choose another key, or create one that does.` });
    if (key.allowedOrigins.length === 0) out.push({ level: "error", message: `The key "${key.name}" has no allowed sites.` });
    if (key.mode === "test") out.push({ level: "info", message: "This is a test key: results are marked as test, and you can use http://localhost in its allowed sites. Switch to a live key when you publish." });
  }
  if (o.packStatus !== "verified") out.push({ level: "info", message: `This pack is ${o.packStatus}. The widget tells every visitor that its rules have not been fully verified and that a person should review the result.` });
  return out;
}

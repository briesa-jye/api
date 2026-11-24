// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildConfig, checkWidget, embedSnippet, escapeAttr, initialState, type KeyChoice, type WidgetState } from "../apps/web/src/lib/widget-config.ts";
import type { Field } from "../apps/web/src/lib/schema-fields.ts";

const ALL = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
const fields: Field[] = [
  { path: "incident_type", label: "Incident type", group: "", kind: "enum", options: ["death", "other"], required: true },
  { path: "arose_from_work", label: "Arose from work", group: "", kind: "boolean", required: true },
  { path: "note", label: "Note", group: "", kind: "string", required: false },
];
const key = (over: Partial<KeyChoice> = {}): KeyChoice => ({ id: "k", name: "site", mode: "live", publicKey: "pk_live_0123456789_" + "a".repeat(32), allowedOrigins: ["https://www.example.com"], scopes: ["assess", "read", "pack:whs"], ...over });

describe("widget config", () => {
  it("writes only what differs from the widget's own defaults", () => {
    const s = initialState("whs", "classify");
    expect(buildConfig(s, ALL)).toEqual({ pack: "whs", scenario: "classify" });
    const t: WidgetState = {
      ...s, jurisdictions: ["NSW", "QLD", "XX"],
      questions: { arose_from_work: { show: false, label: "ignored when hidden", help: "", value: "true" }, incident_type: { show: true, label: " What happened? ", help: "", value: "stale" }, note: { show: true, label: "", help: "", value: "" } },
      theme: { accent: "#0B7A75", mode: "dark", radius: "lg" },
      copy: { title: "Is it notifiable?", intro: "", submit: "Check", brand: false, schemaHelp: true },
      result: { actions: false, reasons: true },
    };
    expect(buildConfig(t, ALL)).toEqual({
      pack: "whs", scenario: "classify", jurisdictions: ["NSW", "QLD"],
      questions: { arose_from_work: { show: false, value: "true" }, incident_type: { label: "What happened?" } }, // a shown question never carries a stale hidden answer
      theme: { accent: "#0B7A75", mode: "dark", radius: "lg" },
      copy: { title: "Is it notifiable?", brand: false, schemaHelp: true }, result: { actions: false },
    });
    expect(buildConfig({ ...s, jurisdictions: ALL }, ALL).jurisdictions).toBeUndefined(); // all selected is the same as the default
    expect(buildConfig({ ...s, theme: { ...s.theme, accent: "#5170FF" } }, ALL).theme).toBeUndefined(); // the default colour in another case
  });

  it("produces a snippet whose attributes survive HTML and read back to the same config", () => {
    const config = { pack: "p", scenario: "s", copy: { title: `Say "hi" & <b>bye</b>`, intro: "It's fine" } };
    const html = embedSnippet({ siteUrl: "https://site.example/", apiUrl: "https://api.example/", key: "pk_live_x", config });
    expect(html).toContain('src="https://site.example/widget/v1.js"');
    expect(html).toContain('data-briesa-api="https://api.example"'); // trailing slash trimmed
    const doc = new DOMParser().parseFromString(html, "text/html");
    const el = doc.querySelector("script")!;
    expect(el.getAttribute("data-briesa-key")).toBe("pk_live_x");
    expect(JSON.parse(el.getAttribute("data-briesa-config")!)).toEqual(config);
    expect(html).not.toMatch(/<b>/); // markup in the text cannot break out of the attribute
    expect(escapeAttr(`a"b&c<d>`)).toBe("a&quot;b&amp;c&lt;d&gt;");
  });

  it("flags what would stop the widget working", () => {
    const s = initialState("whs", "classify");
    const hidden = { ...s, questions: { arose_from_work: { show: false, label: "", help: "", value: "" } } };
    const msgs = (p: ReturnType<typeof checkWidget>, level: string) => p.filter((x) => x.level === level).map((x) => x.message).join("\n");
    expect(msgs(checkWidget({ state: hidden, fields, packStatus: "draft", key: key() }), "error")).toMatch(/"Arose from work" is required but hidden/);
    expect(msgs(checkWidget({ state: { ...hidden, questions: { arose_from_work: { show: false, label: "", help: "", value: "true" } } }, fields, packStatus: "draft", key: key() }), "error")).toBe("");
    expect(msgs(checkWidget({ state: s, fields, packStatus: "draft", key: null }), "error")).toMatch(/Choose a publishable key/);
    expect(msgs(checkWidget({ state: s, fields, packStatus: "draft", key: key({ scopes: ["assess", "pack:other"] }) }), "error")).toMatch(/does not include this pack/);
    expect(msgs(checkWidget({ state: s, fields, packStatus: "draft", key: key({ allowedOrigins: [] }) }), "error")).toMatch(/no allowed sites/);
    expect(msgs(checkWidget({ state: s, fields, packStatus: "draft", key: key() }), "info")).toMatch(/pack is draft/);
    expect(checkWidget({ state: s, fields, packStatus: "verified", key: key() })).toEqual([]);
    expect(msgs(checkWidget({ state: s, fields, packStatus: "verified", key: key({ mode: "test" }) }), "info")).toMatch(/test key/);
  });
});

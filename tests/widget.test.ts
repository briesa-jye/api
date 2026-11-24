// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessPack } from "@briesa/packs/assessment";
import { PackRegistry } from "@briesa/packs/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInputs as appBuildInputs, flattenSchema as appFlatten, toFormValues } from "../apps/web/src/lib/schema-fields.ts";

// The widget is a plain browser script. Load it the way a browser would: run its source with a `module` object so it also exposes its internals.
const widgetSource = readFileSync(resolve(import.meta.dirname, "../apps/web/public/widget/v1.js"), "utf8");
const widgetModule: { exports: any } = { exports: {} };
new Function("module", widgetSource)(widgetModule);
const W = widgetModule.exports as any;

const registry = PackRegistry.fromDir(resolve(import.meta.dirname, "../packs"));
const real = registry.list().filter((p) => p.rules.length > 0);
const whs = real.find((p) => p.manifest.id === "whs-incident-notification")!;

/** Exactly what GET /v1/packs/:id returns. */
const packDetail = (id: string) => {
  const p = registry.get(id)!;
  return {
    id: p.manifest.id, name: p.manifest.name, industry: p.manifest.industry, regulators: p.manifest.regulators, jurisdictions: p.manifest.jurisdictions,
    version: p.manifest.version, status: p.manifest.status, reviewer: null, licence_tier: p.manifest.licence_tier,
    scenario_types: Object.fromEntries(Object.entries(p.manifest.scenario_types).map(([k, v]) => [k, { description: v.description, outcomes: v.outcome.order, input_schema: p.inputSchemas[k] }])),
  };
};
/** Runs the real server-side assessment, so the widget is tested against genuine API responses. */
function fakeApi(over: { assess?: (b: any) => any } = {}) {
  const calls: { assess: any[]; getPack: string[] } = { assess: [], getPack: [] };
  return {
    calls,
    getPack: async (id: string) => { calls.getPack.push(id); return packDetail(id); },
    assess: async (body: any) => {
      calls.assess.push(body);
      if (over.assess) return over.assess(body);
      const out = assessPack(registry.get(body.pack)!, { scenarioType: body.scenario_type, jurisdiction: body.jurisdiction, inputs: body.inputs });
      if (!out.ok) throw new W.ApiFailure(400, out.code, out.message);
      return { ...out.core, ai_assisted_notes: null, ai_status: "not_requested", reference: null, test_mode: true, request_id: "req_test123" };
    },
  };
}
const CFG = { pack: "whs-incident-notification", scenario: "classify_incident", jurisdictions: ["NSW", "QLD"] };
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

let host: HTMLElement;
beforeEach(() => { document.body.innerHTML = ""; host = document.createElement("div"); document.body.appendChild(host); });
afterEach(() => { vi.restoreAllMocks(); });
const q = (sel: string) => host.shadowRoot!.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => Array.from(host.shadowRoot!.querySelectorAll(sel)) as HTMLElement[];
const text = () => host.shadowRoot!.textContent ?? "";
const setSelect = (el: HTMLSelectElement, v: string) => { el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); };
const submit = () => q("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

describe("config handling", () => {
  it("clamps and cleans whatever the page supplies", () => {
    const c = W.sanitizeConfig({
      pack: "p", scenario: "s", jurisdictions: ["NSW", "NSW", "XX", "WA"],
      theme: { accent: "red; background:url(//evil)", mode: "neon", radius: "huge" },
      copy: { title: "x".repeat(500), submit: "", brand: "yes" },
      result: { actions: false },
      questions: { "a.b": { show: false, value: "true", label: "L" }, "__proto__": { show: false }, "bad path!": {}, constructor: {} },
      extra: "dropped",
    });
    expect(c.jurisdictions).toEqual(["NSW", "WA"]);
    expect(c.theme).toEqual({ accent: "#5170ff", mode: "auto", radius: "md" }); // an unsafe colour never reaches the stylesheet
    expect(c.copy.title).toHaveLength(120);
    expect(c.copy.submit).toBe("Check");
    expect(c.copy.brand).toBe(true);
    expect(c.copy.schemaHelp).toBe(false);
    expect(c.result).toEqual({ actions: false, reasons: true });
    expect(Object.keys(c.questions)).toEqual(["a.b"]);
    expect(c).not.toHaveProperty("extra");
    expect(W.sanitizeConfig(null).pack).toBe("");
    expect(W.sanitizeConfig({ theme: { accent: "#abc" } }).theme.accent).toBe("#abc");
  });

  it("flattens every real pack's schema exactly as the dashboard does", () => {
    for (const p of real) {
      for (const [id] of Object.entries(p.manifest.scenario_types)) {
        const schema = p.inputSchemas[id];
        const a = W.flattenSchema(schema).map((f: any) => ({ path: f.path, kind: f.kind, required: f.required, options: f.options ?? null }));
        const b = appFlatten(schema).map((f) => ({ path: f.path, kind: f.kind, required: f.required, options: f.options ?? null }));
        expect(a, `${p.manifest.id}/${id}`).toEqual(b);
      }
    }
  });

  it("builds the same inputs from form answers as the dashboard, for every example in every pack", () => {
    let n = 0;
    for (const p of real) {
      for (const ex of p.scenarios) {
        const fields = W.flattenSchema(p.inputSchemas[ex.scenario_type]);
        const values = toFormValues(appFlatten(p.inputSchemas[ex.scenario_type]), ex.inputs);
        expect(W.buildInputs(fields, values), ex.id).toEqual(ex.inputs);
        expect(W.buildInputs(fields, values)).toEqual(appBuildInputs(appFlatten(p.inputSchemas[ex.scenario_type]), values));
        n++;
      }
    }
    expect(n).toBeGreaterThan(30);
  });

  it("only links https sources", () => {
    expect(W.safeUrl("https://www.safeworkaustralia.gov.au/x")).toBe("https://www.safeworkaustralia.gov.au/x");
    for (const bad of ["javascript:alert(1)", "http://example.com", "data:text/html,x", "//evil.com", undefined, 5]) expect(W.safeUrl(bad)).toBeNull();
  });
});

describe("the widget in a page", () => {
  it("asks the pack's questions and shows a real result with the notices that cannot be switched off", async () => {
    const api = fakeApi();
    const ready = vi.fn(), result = vi.fn();
    host.addEventListener("briesa:ready", ready); host.addEventListener("briesa:result", result);
    W.mount(host, { ...CFG, result: { actions: false, reasons: false }, copy: { title: "Is it notifiable?", submit: "Find out" } }, { transport: api });
    await tick();
    expect(q("h2")!.textContent).toBe("Is it notifiable?");
    expect(ready).toHaveBeenCalledTimes(1);
    expect(qa("select[name=jurisdiction] option").map((o) => o.textContent)).toEqual(["NSW", "QLD"]);
    expect(text()).toMatch(/do not enter personal information/i);

    setSelect(q("select[name^=bw]") as HTMLSelectElement, "death"); // the 7-option question is a dropdown
    (qa("input[type=radio]").find((r) => (r as HTMLInputElement).value === "true") as HTMLInputElement).checked = true;
    submit();
    await tick();

    expect(api.calls.assess).toHaveLength(1);
    expect(api.calls.assess[0]).toMatchObject({ pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "NSW", inputs: { incident_type: "death", arose_from_work: true } });
    expect(q("h2")!.textContent).toBe("Result");
    expect(text()).toContain("Notifiable");
    expect(text()).toMatch(/Human review recommended/);
    expect(text()).toMatch(/rules behind this result are draft/);
    expect(text()).toMatch(/not legal advice/i); // the disclaimer survives result.actions=false and result.reasons=false
    expect(text()).not.toMatch(/What to do/);
    expect(text()).not.toMatch(/Why this result/);
    expect(text()).toContain("WHS incident notification v0.4.0 (draft)");
    expect(text()).toContain("Powered by Briesa");
    expect(result).toHaveBeenCalledTimes(1);
    expect((result.mock.calls[0]![0] as CustomEvent).detail.outcome).toBe("notifiable");

    (qa("button.link")[0] as HTMLElement).click(); // start again
    expect(q("form")).not.toBeNull();
  });

  it("shows actions and reasons with https sources when enabled", async () => {
    W.mount(host, { ...CFG, copy: { brand: false } }, { transport: fakeApi() });
    await tick();
    setSelect(q("select[name^=bw]") as HTMLSelectElement, "death");
    (qa("input[type=radio]").find((r) => (r as HTMLInputElement).value === "true") as HTMLInputElement).checked = true;
    submit(); await tick();
    expect(text()).toMatch(/What to do/);
    expect(text()).toMatch(/Notify the WHS regulator immediately/);
    expect(text()).toMatch(/Why this result/);
    expect(text()).not.toContain("Powered by Briesa");
    const link = qa("a")[0] as HTMLAnchorElement;
    expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("will not submit with a required question unanswered, and says which", async () => {
    const api = fakeApi();
    W.mount(host, CFG, { transport: api });
    await tick();
    submit(); await tick();
    expect(api.calls.assess).toHaveLength(0);
    expect(qa(".err").filter((e) => !e.hidden).map((e) => e.textContent)).toEqual(["Please answer this question.", "Please answer this question."]);
  });

  it("applies the page owner's answer for a hidden question and does not show it", async () => {
    const api = fakeApi();
    W.mount(host, { ...CFG, questions: { arose_from_work: { show: false, value: "true" } } }, { transport: api });
    await tick();
    expect(q('[data-path="arose_from_work"]')).toBeNull(); // hidden, not just empty
    expect(q('[data-path="incident_type"]')).not.toBeNull();
    setSelect(q("select[name^=bw]") as HTMLSelectElement, "death");
    submit(); await tick();
    expect(api.calls.assess[0].inputs).toEqual({ incident_type: "death", arose_from_work: true });
    expect(text()).toContain("Notifiable");
  });

  it("shows the pack's developer help text only when the page owner opts in", async () => {
    const on = document.createElement("div"); document.body.appendChild(on);
    W.mount(host, CFG, { transport: fakeApi() });
    W.mount(on, { ...CFG, copy: { schemaHelp: true } }, { transport: fakeApi() });
    await tick();
    expect(text()).not.toMatch(/violent_incident/);
    expect(on.shadowRoot!.textContent).toMatch(/violent_incident/);
  });

  it("relabels questions", async () => {
    W.mount(host, { ...CFG, questions: { arose_from_work: { label: "Did it happen at work?", help: "Include work trips." } } }, { transport: fakeApi() });
    await tick();
    expect(text()).toContain("Did it happen at work?");
    expect(text()).toContain("Include work trips.");
  });

  it("refuses to run when a required question is hidden with no value, and tells the page owner in the console", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn(); host.addEventListener("briesa:error", onError);
    W.mount(host, { ...CFG, questions: { arose_from_work: { show: false } } }, { transport: fakeApi() });
    await tick();
    expect(q("form")).toBeNull();
    expect(text()).toMatch(/not available on this page/);
    expect(err.mock.calls.flat().join(" ")).toMatch(/arose_from_work/);
    expect(onError).toHaveBeenCalled();
  });

  it("quiet mode keeps console messages out for hosts that show problems another way", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    W.mount(host, { ...CFG, questions: { arose_from_work: { show: false } } }, { transport: fakeApi(), quiet: true });
    await tick();
    expect(text()).toMatch(/not available on this page/); // visitors still get the safe message
    expect(err).not.toHaveBeenCalled();
  });

  it("shows visitors a plain message for API failures and gives the page owner the real reason", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = { getPack: async () => { throw new W.ApiFailure(403, "origin_not_allowed", "This origin is not allowed for this publishable key. Add it to the key's allowed origins in the dashboard."); }, assess: async () => ({}) };
    W.mount(host, CFG, { transport: bad });
    await tick();
    expect(text()).toMatch(/not available on this page/);
    expect(text()).not.toMatch(/origin/i); // visitors never see key or origin details
    expect(err.mock.calls.flat().join(" ")).toMatch(/origin_not_allowed/);
    expect(err.mock.calls.flat().join(" ")).toMatch(/Add ".+" to the key's allowed sites/); // tells the site owner exactly what to fix

    const capped = fakeApi({ assess: () => { throw new W.ApiFailure(429, "monthly_cap_reached", "cap"); } });
    const host2 = document.createElement("div"); document.body.appendChild(host2);
    W.mount(host2, CFG, { transport: capped }); await tick();
    setSelect(host2.shadowRoot!.querySelector("select[name^=bw]") as HTMLSelectElement, "death");
    (host2.shadowRoot!.querySelector("input[value=true]") as HTMLInputElement).checked = true;
    host2.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true })); await tick();
    expect(host2.shadowRoot!.textContent).toMatch(/busy right now/);
    expect((host2.shadowRoot!.querySelector("button.primary") as HTMLButtonElement).disabled).toBe(false); // the visitor can try again
  });

  it("renders API text as text, never as markup, and does not link javascript: sources", async () => {
    const evil = fakeApi({
      assess: () => ({
        outcome: "notifiable", escalation_recommended: false, human_review_recommended: true, disclaimer: "<img src=x onerror=alert(1)> disclaimer",
        pack: { id: "whs-incident-notification", version: "0.4.0", status: "draft" }, request_id: "req_x", missing_information: [],
        required_actions: [{ id: "a", description: "<script>window.__pwned=1</script>Do this", rule_id: "r" }],
        reasons: [{ rule_id: "r", rule_version: "1.0.0", title: "<b>bold</b>", explanation: "<img src=x onerror=alert(1)>", source: { instrument: "Act", url: "javascript:alert(1)" } }],
      }),
    });
    W.mount(host, CFG, { transport: evil }); await tick();
    setSelect(q("select[name^=bw]") as HTMLSelectElement, "death");
    (qa("input[type=radio]").find((r) => (r as HTMLInputElement).value === "true") as HTMLInputElement).checked = true;
    submit(); await tick();
    expect(host.shadowRoot!.querySelector("img")).toBeNull();
    expect(host.shadowRoot!.querySelector("script")).toBeNull();
    expect((window as any).__pwned).toBeUndefined();
    expect(text()).toContain("<script>window.__pwned=1</script>Do this"); // visible as plain text
    expect(qa("a")).toHaveLength(0); // the javascript: URL was not made a link
  });

  it("applies the theme as CSS variables only after validating it", async () => {
    W.mount(host, { ...CFG, theme: { accent: "#ff0066", mode: "dark", radius: "lg" } }, { transport: fakeApi() });
    await tick();
    const w = q(".w")!;
    expect(w.classList.contains("dark")).toBe(true);
    expect(w.style.getPropertyValue("--bw-accent")).toBe("#ff0066");
    expect(w.style.getPropertyValue("--bw-radius")).toBe("16px");
  });

  it("works for the real-estate pack's nested questions too", async () => {
    const re = real.find((p) => p.manifest.id === "real-estate-aml")!;
    const sc = Object.keys(re.manifest.scenario_types)[0]!;
    const api = fakeApi();
    W.mount(host, { pack: re.manifest.id, scenario: sc, jurisdictions: ["AU"] }, { transport: api });
    await tick();
    expect(q("form")).not.toBeNull();
    expect(qa("[data-path]").map((e) => e.getAttribute("data-path"))).toContain("customer.pep_status");
  });

  it("destroy() removes the widget", async () => {
    const w = W.mount(host, CFG, { transport: fakeApi() });
    await tick();
    w.destroy();
    expect(host.shadowRoot!.textContent).toBe("");
  });
});

describe("starting from a script tag", () => {
  const script = (attrs: Record<string, string>) => {
    const s = document.createElement("script");
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    document.body.appendChild(s);
    return s;
  };

  it("sends the publishable key as a bearer token, with an idempotency key, to the configured API", async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => (init.method === "GET" ? packDetail("whs-incident-notification") : { outcome: "not_notifiable", required_actions: [], missing_information: [], reasons: [], escalation_recommended: false, human_review_recommended: true, disclaimer: "d", pack: { id: "whs-incident-notification", version: "0.4.0", status: "draft" }, request_id: "req_1" }),
    }));
    (window as any).fetch = fetchMock;
    const s = script({ "data-briesa-key": "pk_test_0123456789_" + "a".repeat(32), "data-briesa-api": "https://api.example.test/", "data-briesa-config": JSON.stringify(CFG) });
    W.autoStart(s);
    await tick(10);
    const widgetHost = s.nextElementSibling as HTMLElement;
    expect(widgetHost.shadowRoot).not.toBeNull();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/v1/packs/whs-incident-notification");
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toMatch(/^Bearer pk_test_/);
    setSelect(widgetHost.shadowRoot!.querySelector("select[name^=bw]") as HTMLSelectElement, "other");
    (widgetHost.shadowRoot!.querySelector("input[value=true]") as HTMLInputElement).checked = true;
    widgetHost.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await tick(10);
    const post = fetchMock.mock.calls[1]!;
    expect(post[0]).toBe("https://api.example.test/v1/assess");
    expect(post[1].method).toBe("POST");
    expect(post[1].headers["Idempotency-Key"]).toBeTruthy();
    expect(JSON.parse(post[1].body)).toMatchObject({ pack: "whs-incident-notification", jurisdiction: "NSW" });
  });

  it("refuses to start with a secret key in the page and says to rotate it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(); (window as any).fetch = fetchMock;
    const s = script({ "data-briesa-key": "bk_live_0123456789_" + "a".repeat(32), "data-briesa-config": JSON.stringify(CFG) });
    W.autoStart(s);
    await tick();
    expect(s.nextElementSibling).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(err.mock.calls.flat().join(" ")).toMatch(/SECRET key.*rotate/);
  });

  it("mounts into a chosen target and survives bad JSON", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    (window as any).fetch = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => packDetail("whs-incident-notification") }));
    const target = document.createElement("div"); target.id = "here"; document.body.appendChild(target);
    W.autoStart(script({ "data-briesa-key": "pk_test_0123456789_" + "a".repeat(32), "data-briesa-api": "https://x.test", "data-briesa-config": JSON.stringify(CFG), "data-briesa-target": "#here" }));
    await tick(10);
    expect(target.shadowRoot!.querySelector("form")).not.toBeNull();
    W.autoStart(script({ "data-briesa-key": "pk_test_0123456789_" + "a".repeat(32), "data-briesa-config": "{not json" }));
    expect(err.mock.calls.flat().join(" ")).toMatch(/not valid JSON/);
  });
});

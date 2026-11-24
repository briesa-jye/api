"use client";

import { assessCore } from "@briesa/packs/core";
import { useEffect, useMemo, useRef } from "react";
import type { LivePack, LiveScenario } from "@/lib/playground-engine";

interface WidgetApi { mount(host: HTMLElement, config: unknown, options: { transport: unknown; quiet?: boolean }): { destroy(): void } }
declare global { interface Window { BriesaWidget?: WidgetApi } }

let loading: Promise<WidgetApi> | null = null;
/** Loads the same /widget/v1.js a customer's page would load, once. It only registers window.BriesaWidget when it has no data-briesa-key. */
function loadWidget(): Promise<WidgetApi> {
  if (window.BriesaWidget) return Promise.resolve(window.BriesaWidget);
  loading ??= new Promise<WidgetApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/widget/v1.js";
    s.onload = () => (window.BriesaWidget ? resolve(window.BriesaWidget) : reject(new Error("widget did not start")));
    s.onerror = () => { loading = null; reject(new Error("could not load the widget")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The real widget, running against the in-browser rule engine instead of the API. So the preview works with no key, no site and no
 * network, and shows exactly the widget a visitor would get (the rules are the same assessCore the API runs).
 */
export function WidgetPreview({ pack, scenario, config }: { pack: LivePack; scenario: LiveScenario; config: Record<string, unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  const configJson = JSON.stringify(config);
  const transport = useMemo(() => ({
    getPack: async (id: string) => {
      if (id !== pack.id) throw Object.assign(new Error("No such pack."), { status: 404, code: "pack_not_found" });
      return {
        id: pack.id, name: pack.name, version: pack.version, status: pack.status, jurisdictions: pack.jurisdictions, regulators: [], industry: "",
        scenario_types: Object.fromEntries(pack.scenarios.map((s) => [s.id, { description: s.description, outcomes: s.outcome.order, input_schema: s.inputSchema ?? {} }])),
      };
    },
    assess: async (body: { scenario_type: string; jurisdiction: string; inputs: Record<string, unknown> }) => {
      await new Promise((r) => setTimeout(r, 350)); // so "Checking..." is visible, as it is on a real page
      const { core } = assessCore({ manifest: { id: pack.id, version: pack.version, status: pack.status }, rules: pack.rules }, scenario.outcome, {
        scenarioType: body.scenario_type, jurisdiction: body.jurisdiction, inputs: body.inputs,
      });
      return { ...core, ai_assisted_notes: null, ai_status: "not_requested", reference: null, test_mode: true, request_id: "req_preview" };
    },
  }), [pack, scenario]);

  // The old widget stays on screen until the new one is ready to replace it, so tweaking a setting does not flash blank.
  const current = useRef<{ destroy(): void } | null>(null);
  useEffect(() => {
    let cancelled = false;
    // quiet: the builder's Checks panel already says what is wrong, so the widget need not also log it.
    const t = setTimeout(() => {
      loadWidget().then((api) => {
        if (cancelled || !ref.current) return;
        current.current?.destroy();
        current.current = api.mount(ref.current, JSON.parse(configJson), { transport, quiet: true });
      }).catch(() => {});
    }, 150); // wait for typing to settle
    return () => { cancelled = true; clearTimeout(t); };
  }, [configJson, transport]);
  useEffect(() => () => { current.current?.destroy(); current.current = null; }, []);

  return (
    <div ref={ref} />
  );
}

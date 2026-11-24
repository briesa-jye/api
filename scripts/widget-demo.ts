/**
 * Local demo of the embeddable widget in a real browser, across two origins like a customer's site.
 *
 *   node scripts/widget-demo.ts
 *
 * Starts the API (in-memory, real packs) on :4011 and a plain web page on :4010 that embeds the widget with a publishable key
 * allowed for http://localhost:4010 only. Open http://localhost:4010. Opening http://127.0.0.1:4010 instead is a different origin,
 * so the widget is refused: a quick way to see the origin rules work.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryStore } from "@briesa/db";
import { PackRegistry } from "@briesa/packs";
import { createKey } from "@briesa/accounts/manage";
import { buildApp } from "../apps/api/src/app.ts";

const here = import.meta.dirname;
const PAGE_PORT = 4010, API_PORT = 4011;
const store = new MemoryStore();
const app = await buildApp({ store, packs: PackRegistry.fromDir(resolve(here, "../packs")) });
const tenant = await store.createTenant({ name: "Demo", billingExempt: true });
const { key } = await createKey(store, { tenantId: tenant.id, scopes: ["*"] }, {
  name: "demo widget", mode: "test", kind: "publishable", scopes: ["assess", "read", "pack:whs-incident-notification"], allowed_origins: [`http://localhost:${PAGE_PORT}`],
});
await app.listen({ port: API_PORT, host: "127.0.0.1" });

const config = {
  pack: "whs-incident-notification", scenario: "classify_incident", jurisdictions: ["NSW", "QLD", "WA"],
  questions: { serious_injury_criteria_met: { show: false }, serious_risk_exposed: { show: true, label: "Was anyone put at serious risk?" } },
  theme: { accent: "#0b7a75", mode: "auto", radius: "lg" },
  copy: { title: "Is this incident notifiable?", intro: "Answer a few questions to find out whether you must tell the regulator.", submit: "Check now" },
};
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// The host page deliberately has aggressive global CSS, to show the widget's shadow root keeps it out.
const page = `<!doctype html><meta charset="utf-8"><title>Customer site</title>
<style>*{font-family:Georgia,serif!important;color:#333!important;letter-spacing:.05em} button,input,select{border:3px dotted red!important} body{max-width:720px;margin:40px auto;padding:0 16px}</style>
<h1>Acme Safety Consulting</h1><p>This page stands in for a customer's own website. The widget below is the embed.</p>
<script src="/widget/v1.js" async data-briesa-key="${key}" data-briesa-api="http://localhost:${API_PORT}" data-briesa-config="${escapeAttr(JSON.stringify(config))}"></script>
<p id="log">Events: </p>
<script>for (const n of ["ready","result","error","reset"]) document.addEventListener("briesa:"+n, e => { document.getElementById("log").textContent += n + " "; });</script>`;

createServer((req, res) => {
  if (req.url === "/widget/v1.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(readFileSync(resolve(here, "../apps/web/public/widget/v1.js"))); return; }
  res.writeHead(200, { "content-type": "text/html" }); res.end(page);
}).listen(PAGE_PORT, "127.0.0.1", () => console.log(`page: http://localhost:${PAGE_PORT}   api: http://localhost:${API_PORT}`));

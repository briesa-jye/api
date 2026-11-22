import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { MemoryStore } from "@briesa/db";
import { PackRegistry, validatePack } from "@briesa/packs";
import { describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { generateKey } from "../apps/api/src/keys.ts";

const packsDir = resolve(import.meta.dirname, "../packs");
const ids = readdirSync(packsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

describe("shipped packs", () => {
  it("includes the two real packs and three stubs", () => {
    expect(ids.sort()).toEqual(["building-construction", "education", "finance", "real-estate-aml", "whs-incident-notification"]);
  });
  for (const id of ids) {
    it(`${id} validates with no errors and all scenarios passing`, () => {
      const r = validatePack(join(packsDir, id));
      expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    });
  }
  it("no pack claims to be verified without reviewer metadata", () => {
    for (const p of PackRegistry.fromDir(packsDir).list()) {
      if (p.manifest.status === "verified") expect(p.manifest.reviewer).toBeTruthy();
    }
    expect(PackRegistry.fromDir(packsDir).list().filter((p) => p.manifest.status === "verified")).toEqual([]);
  });
  it("stubs contain no rules or obligations", () => {
    const reg = PackRegistry.fromDir(packsDir);
    for (const id of ["building-construction", "education", "finance"]) {
      expect(reg.get(id)!.rules).toHaveLength(0);
      expect(reg.get(id)!.obligations).toHaveLength(0);
    }
  });
  it("every active rule and obligation in the real packs has a retrieved source", () => {
    const reg = PackRegistry.fromDir(packsDir);
    for (const id of ["real-estate-aml", "whs-incident-notification"]) {
      for (const item of [...reg.get(id)!.rules, ...reg.get(id)!.obligations]) {
        if (item.status === "active") {
          expect(item.source?.instrument, `${id}/${item.id}`).toBeTruthy();
          expect(item.source?.retrieved ?? item.source?.url, `${id}/${item.id}`).toBeTruthy();
        }
      }
    }
  });
});

async function boot() {
  const store = new MemoryStore();
  const app = await buildApp({ store, packs: PackRegistry.fromDir(packsDir) });
  const t = await store.createTenant({ name: "T", billingExempt: true });
  const g = generateKey("test");
  await store.createApiKey({ tenantId: t.id, name: "k", prefix: g.prefix, hash: g.hash, mode: "test", scopes: ["assess", "read", "pack:*"], rateLimitPerMinute: 1000, rotatedFromId: null });
  const h = { authorization: `Bearer ${g.key}` };
  return { app, assess: (payload: object) => app.inject({ method: "POST", url: "/v1/assess", headers: h, payload }), h };
}

describe("real packs through the API", () => {
  it("lists all five packs with their draft status", async () => {
    const { app, h } = await boot();
    const packs = (await app.inject({ url: "/v1/packs", headers: h })).json().packs;
    expect(packs.map((p: { id: string; status: string }) => `${p.id}:${p.status}`).sort()).toEqual([
      "building-construction:draft", "education:draft", "finance:draft", "real-estate-aml:draft", "whs-incident-notification:draft",
    ]);
  });
  it("real-estate-aml: foreign PEP gets enhanced CDD, escalation, sources and a human-review flag", async () => {
    const { assess } = await boot();
    const r = await assess({
      pack: "real-estate-aml", scenario_type: "customer_due_diligence", jurisdiction: "NSW",
      inputs: {
        service: { interest_type: "fee_simple", directly_advances_transaction: true, transaction_exists: true, court_or_tribunal_order: false, in_course_of_business: true },
        customer: { type: "individual", role: "buyer", pep_status: "foreign_pep", sanctions_status: "not_designated", high_risk_jurisdiction_link: "no", identity_verified: "verified", beneficial_owners_identified: "not_applicable", purpose_and_nature_established: true, source_of_funds_established: true, ml_tf_risk_rating: "medium", unusual_transaction: false, suspicion_formed: false },
      },
    });
    const b = r.json();
    expect(r.statusCode).toBe(200);
    expect(b.outcome).toBe("enhanced_cdd");
    expect(b.escalation_recommended).toBe(true);
    expect(b.human_review_recommended).toBe(true);
    expect(b.pack.status).toBe("draft");
    expect(b.test_mode).toBe(true);
    for (const reason of b.reasons) {
      expect(reason.source.url).toMatch(/^https:\/\/www\.austrac\.gov\.au\//);
      expect(reason.effective_from).toBe("2026-07-01");
    }
  });
  it("real-estate-aml: a needs_review rule matches but is not applied, and is reported as pending", async () => {
    const { assess } = await boot();
    const r = await assess({
      pack: "real-estate-aml", scenario_type: "customer_due_diligence", jurisdiction: "VIC",
      inputs: {
        service: { interest_type: "fee_simple", directly_advances_transaction: true, transaction_exists: true, court_or_tribunal_order: false, in_course_of_business: true },
        customer: { type: "individual", role: "buyer", foreign_person: true, pep_status: "not_pep", sanctions_status: "not_designated", high_risk_jurisdiction_link: "no", identity_verified: "verified", beneficial_owners_identified: "not_applicable", purpose_and_nature_established: true, source_of_funds_established: false, ml_tf_risk_rating: "low", unusual_transaction: false, suspicion_formed: false },
      },
    });
    const b = r.json();
    expect(b.outcome).toBe("standard_cdd");
    expect(b.rules_pending_review.map((x: { rule_id: string }) => x.rule_id)).toEqual(["foreign-person-risk-factor"]);
  });
  it("whs-incident-notification: death in NSW is notifiable with regulator contact", async () => {
    const { assess } = await boot();
    const b = (await assess({ pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "NSW", inputs: { incident_type: "death", arose_from_work: true } })).json();
    expect(b.outcome).toBe("notifiable");
    expect(b.required_actions.map((a: { id: string }) => a.id)).toContain("notify-safework-nsw");
    expect(b.required_actions.find((a: { id: string }) => a.id === "notify-safework-nsw").description).toMatch(/13 10 50/);
    expect(b.human_review_recommended).toBe(true);
  });
  it("whs-incident-notification: Victoria never returns a confident 'not notifiable'", async () => {
    const { assess } = await boot();
    for (const inputs of [{ incident_type: "death", arose_from_work: true }, { incident_type: "death", arose_from_work: false }, { incident_type: "other", arose_from_work: true }]) {
      const b = (await assess({ pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "VIC", inputs })).json();
      expect(b.outcome).toBe("needs_information");
      expect(b.escalation_recommended).toBe(true);
    }
  });
  it("whs-incident-notification: a jurisdiction outside the pack is rejected", async () => {
    const { assess } = await boot();
    const r = await assess({ pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "AU", inputs: { incident_type: "death", arose_from_work: true } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("unsupported_jurisdiction");
  });
  it("stub packs assess to their default with human review recommended", async () => {
    const { assess } = await boot();
    const b = (await assess({ pack: "education", scenario_type: "general", jurisdiction: "AU", inputs: {} })).json();
    expect(b.outcome).toBe("no_action_identified");
    expect(b.reasons).toEqual([]);
    expect(b.human_review_recommended).toBe(true);
  });
});

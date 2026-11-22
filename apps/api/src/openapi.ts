import { ObligationSchema, RuleSchema } from "@briesa/engine";
import { z } from "zod";
import { WEBHOOK_EVENTS } from "@briesa/db";
import { assessBody } from "./routes/assess.ts";
import { createKeyBody } from "./routes/keys.ts";
import { createWebhookBody } from "./routes/webhooks.ts";

type Obj = Record<string, unknown>;
const hoisted: Record<string, Obj> = {};
/** Zod schema -> JSON Schema, hoisting any $defs into components.schemas under unique names. */
const js = (s: z.ZodType, prefix = "Inline"): Obj => {
  const { $schema: _omit, $defs, ...rest } = z.toJSONSchema(s, { target: "draft-2020-12", io: "input" }) as Obj;
  const rewrite = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Obj).map(([k, x]) =>
        k === "$ref" && typeof x === "string" && x.startsWith("#/$defs/") ? [k, `#/components/schemas/${prefix}_${x.slice(8)}`] : [k, rewrite(x)]));
    }
    return v;
  };
  for (const [k, def] of Object.entries(($defs ?? {}) as Obj)) hoisted[`${prefix}_${k}`] = rewrite(def) as Obj;
  return rewrite(rest) as Obj;
};
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const str = { type: "string" };
const strN = { type: ["string", "null"] };
const dt = { type: "string", format: "date-time" };

const errorResp = (description: string) => ({ description, content: { "application/json": { schema: ref("ErrorResponse") } } });
const json = (schema: Obj, description = "OK") => ({ description, content: { "application/json": { schema } } });
const idParam = (name: string, description: string) => ({ name, in: "path", required: true, description, schema: str });
const q = (name: string, description: string, schema: Obj = str) => ({ name, in: "query", required: false, description, schema });

interface Op { method: string; path: string; id: string; summary: string; description?: string; scope?: string; params?: Obj[]; body?: Obj; ok: Obj; status?: string; errors?: string[]; idempotent?: boolean; tag: string }

const OPS: Op[] = [
  { method: "get", path: "/health", id: "health", summary: "Health check", tag: "Meta", ok: json({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }) },
  { method: "get", path: "/v1/openapi.json", id: "getOpenApi", summary: "This OpenAPI document", tag: "Meta", ok: json({ type: "object" }) },
  { method: "get", path: "/v1/packs", id: "listPacks", summary: "List packs available to your key", scope: "read", tag: "Packs", ok: json({ type: "object", properties: { packs: { type: "array", items: ref("Pack") } }, required: ["packs"] }) },
  { method: "get", path: "/v1/packs/{id}", id: "getPack", summary: "Get a pack with its scenario types and input schemas", scope: "read", tag: "Packs", params: [idParam("id", "Pack id")], ok: json(ref("PackDetail")), errors: ["404"] },
  { method: "post", path: "/v1/assess", id: "assess", summary: "Run an assessment", description: "Validates `inputs` against the pack's schema for `scenario_type`, runs the pack's versioned rules, and returns an explainable result. Decision support only: every response carries a disclaimer and a `human_review_recommended` flag, and the result always includes the pack's maturity status. Billable on live keys.", scope: "assess", tag: "Assessments", body: js(assessBody, "AssessReq"), ok: json(ref("AssessResponse")), errors: ["400", "404", "409", "429"], idempotent: true },
  { method: "get", path: "/v1/rules", id: "listRules", summary: "List rule definitions", scope: "read", tag: "Rules", params: [q("pack", "Limit to one pack"), q("status", "active, needs_review or retired")], ok: json({ type: "object", properties: { rules: { type: "array", items: ref("PackRule") } }, required: ["rules"] }), errors: ["404"] },
  { method: "get", path: "/v1/rules/{id}", id: "getRule", summary: "Get all versions of a rule", scope: "read", tag: "Rules", params: [idParam("id", "Rule id")], ok: json({ type: "object", properties: { id: str, versions: { type: "array", items: ref("PackRule") } }, required: ["id", "versions"] }), errors: ["404"] },
  { method: "get", path: "/v1/obligations", id: "listObligations", summary: "List obligations in force", description: "Obligations with source references, effective dates and deadlines. Defaults to today's date in Australia/Sydney.", scope: "read", tag: "Obligations", params: [q("pack", "Limit to one pack"), q("activity", "Entity type or activity tag, e.g. pcbu"), q("jurisdiction", "ACT, NSW, NT, QLD, SA, TAS, VIC or WA"), q("as_of", "YYYY-MM-DD")], ok: json({ type: "object", properties: { as_of: str, obligations: { type: "array", items: ref("PackObligation") } }, required: ["as_of", "obligations"] }), errors: ["404"] },
  { method: "get", path: "/v1/audit/{request_id}", id: "getAudit", summary: "Get the stored audit record for a past call", scope: "audit:read", tag: "Audit", params: [idParam("request_id", "The request_id returned by the original call")], ok: json(ref("AuditRecord")), errors: ["404"] },
  { method: "get", path: "/v1/usage", id: "getUsage", summary: "Billable usage for a month", scope: "read", tag: "Usage", params: [q("month", "YYYY-MM, defaults to the current month")], ok: json({ type: "object", properties: { month: str, usage: { type: "array", items: ref("UsageRow") } }, required: ["month", "usage"] }), errors: ["400"] },
  { method: "get", path: "/v1/keys", id: "listKeys", summary: "List API keys", scope: "keys:manage", tag: "API keys", ok: json({ type: "object", properties: { keys: { type: "array", items: ref("ApiKey") } }, required: ["keys"] }) },
  { method: "post", path: "/v1/keys", id: "createKey", summary: "Create an API key", description: "The plaintext key is returned once and cannot be retrieved again. A key can only grant scopes it holds itself.", scope: "keys:manage", tag: "API keys", body: js(createKeyBody, "CreateKey"), ok: json(ref("ApiKeyCreated"), "Created"), status: "201", errors: ["400", "403"] },
  { method: "post", path: "/v1/keys/{id}/rotate", id: "rotateKey", summary: "Rotate a key", description: "Creates a replacement with the same scopes and mode and revokes the old key immediately.", scope: "keys:manage", tag: "API keys", params: [idParam("id", "Key id")], ok: json(ref("ApiKeyCreated"), "Created"), status: "201", errors: ["404"] },
  { method: "post", path: "/v1/keys/{id}/revoke", id: "revokeKey", summary: "Revoke a key", scope: "keys:manage", tag: "API keys", params: [idParam("id", "Key id")], ok: json(ref("ApiKey")), errors: ["404"] },
  { method: "get", path: "/v1/webhooks", id: "listWebhooks", summary: "List webhook endpoints", scope: "webhooks", tag: "Webhooks", ok: json({ type: "object", properties: { webhooks: { type: "array", items: ref("Webhook") } }, required: ["webhooks"] }) },
  { method: "post", path: "/v1/webhooks", id: "createWebhook", summary: "Register a webhook endpoint", description: "The signing secret is returned once. URLs must be https and publicly reachable. Deliveries are signed (see the `webhooks` section) and retried with backoff.", scope: "webhooks", tag: "Webhooks", body: js(createWebhookBody, "CreateWebhook"), ok: json(ref("WebhookCreated"), "Created"), status: "201", errors: ["400", "404"] },
  { method: "delete", path: "/v1/webhooks/{id}", id: "deleteWebhook", summary: "Delete a webhook endpoint", description: "Pending deliveries to it are cancelled.", scope: "webhooks", tag: "Webhooks", params: [idParam("id", "Webhook id")], ok: json({ type: "object", properties: { id: str, deleted: { type: "boolean" } }, required: ["id", "deleted"] }), errors: ["404"] },
  { method: "get", path: "/v1/webhooks/{id}/deliveries", id: "listWebhookDeliveries", summary: "Delivery log for a webhook (latest 50)", scope: "webhooks", tag: "Webhooks", params: [idParam("id", "Webhook id")], ok: json({ type: "object", properties: { deliveries: { type: "array", items: ref("WebhookDelivery") } }, required: ["deliveries"] }), errors: ["404"] },
];

const ERR_DESC: Record<string, string> = {
  "400": "Invalid request (type `invalid_request_error`)", "401": "Missing, invalid or revoked API key", "402": "Live keys need an active subscription (test keys are free); code `subscription_required`", "403": "Key lacks the required scope or pack licence",
  "404": "Not found. Packs you are not licensed for also return 404.", "409": "Idempotency-Key reused with a different request", "429": "Rate limit exceeded; see Retry-After",
};

export const toOpenApiPath = (fastifyUrl: string) => fastifyUrl.replace(/:([A-Za-z_]+)/g, "{$1}");

export function buildOpenApi(): Obj {
  const paths: Record<string, Obj> = {};
  for (const o of OPS) {
    const errors = new Set(o.errors ?? []);
    if (o.scope) { errors.add("401"); errors.add("402"); errors.add("403"); errors.add("429"); }
    const responses: Obj = { [o.status ?? "200"]: o.ok };
    for (const e of [...errors].sort()) responses[e] = errorResp(ERR_DESC[e]!);
    const parameters = [...(o.params ?? [])];
    if (o.method === "post" && o.idempotent) parameters.push({ name: "Idempotency-Key", in: "header", required: false, description: "Repeating a request with the same key and body returns the original response (header `Idempotent-Replayed: true`). Keys are per tenant.", schema: str });
    (paths[o.path] ??= {})[o.method] = {
      operationId: o.id, summary: o.summary, ...(o.description ? { description: o.description } : {}), tags: [o.tag],
      security: o.scope ? [{ bearerAuth: [] }] : [], "x-required-scope": o.scope ?? null,
      ...(parameters.length ? { parameters } : {}),
      ...(o.body ? { requestBody: { required: true, content: { "application/json": { schema: o.body } } } } : {}),
      responses,
    };
  }

  const source = { type: "object", properties: { instrument: str, section: str, url: str, retrieved: str }, required: ["instrument"] };
  const eventEnvelope = (type: string, data: Obj) => ({ type: "object", required: ["id", "type", "created", "livemode", "data"], properties: { id: str, type: { const: type }, created: { type: "integer", description: "Unix seconds" }, livemode: { type: "boolean" }, data } });
  const webhookOp = (id: string, summary: string, data: Obj) => ({
    post: {
      operationId: id, summary, tags: ["Webhooks"],
      description: "Sent to your endpoint. Verify the `Briesa-Signature` header (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with your endpoint secret) and reject timestamps older than 5 minutes. Respond 2xx within 10 seconds; anything else is retried after 1 min, 5 min, 30 min, 2 h and 12 h (6 attempts in total). Redirects are not followed. Events never contain raw assessment inputs.",
      parameters: [{ name: "Briesa-Signature", in: "header", required: true, schema: str }, { name: "Briesa-Event", in: "header", required: true, schema: str }, { name: "Briesa-Delivery", in: "header", required: true, schema: str }],
      requestBody: { required: true, content: { "application/json": { schema: eventEnvelope(id, data) } } },
      responses: { "2XX": { description: "Acknowledged" } },
    },
  });
  const ruleChange = { type: "object", properties: { added: { type: "array", items: str }, changed: { type: "array", items: str }, removed: { type: "array", items: str } }, required: ["added", "changed", "removed"] };

  return {
    openapi: "3.1.0",
    info: {
      title: "Briesa Compliance API", version: "0.1.0",
      summary: "Australian compliance decision support, delivered as industry packs.",
      description: "Decision support, not legal advice. Every assessment is produced by versioned, sourced rules and returns reasons with rule ids, versions, sources and effective dates. AI is optional, labelled, and never makes a regulatory decision. Check each response's `pack.status`: only `verified` packs are production-ready. See the versioning and deprecation policy in the docs.",
    },
    servers: [{ url: "https://api.example.com", description: "Replace with your deployment (no hosted environment exists yet)" }, { url: "http://localhost:3000", description: "Local development" }],
    tags: ["Meta", "Packs", "Assessments", "Rules", "Obligations", "Audit", "Usage", "API keys", "Webhooks"].map((name) => ({ name })),
    security: [{ bearerAuth: [] }],
    paths,
    webhooks: {
      "assessment.completed": webhookOp("assessment.completed", "An assessment completed", { type: "object", properties: { request_id: str, pack: { type: "object", properties: { id: str, version: str, status: str } }, scenario_type: str, jurisdiction: str, outcome: str, escalation_recommended: { type: "boolean" }, human_review_recommended: { type: "boolean" } } }),
      "rules.updated": webhookOp("rules.updated", "Rules in a pack changed", { type: "object", properties: { pack: str, version: strN, rules: ruleChange } }),
      "pack.updated": webhookOp("pack.updated", "A pack was added, removed or its version/status changed", { type: "object", properties: { pack: str, change: { enum: ["added", "removed", "updated"] }, from: { type: ["object", "null"] }, to: { type: ["object", "null"] } } }),
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "API key: `bk_live_…` or `bk_test_…`. Test keys run the same logic, are not billed, and responses carry `test_mode: true`." } },
      schemas: {
        ErrorResponse: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["type", "code", "message", "request_id"], properties: { type: { enum: ["invalid_request_error", "authentication_error", "permission_error", "not_found_error", "idempotency_error", "rate_limit_error", "api_error"] }, code: str, message: str, request_id: str } } } },
        Source: source,
        Pack: { type: "object", required: ["id", "name", "status", "version"], properties: { id: str, name: str, industry: str, regulators: { type: "array", items: str }, jurisdictions: { type: "array", items: str }, version: str, status: { enum: ["draft", "beta", "verified"] }, reviewer: { type: ["object", "null"], properties: { name: str, verified_on: str, source_version: str } }, licence_tier: str } },
        PackDetail: { allOf: [ref("Pack"), { type: "object", properties: { scenario_types: { type: "object", additionalProperties: { type: "object", properties: { description: str, outcomes: { type: "array", items: str, description: "Lowest to highest" }, input_schema: { type: "object", description: "JSON Schema for `inputs`" } } } } } }] },
        AssessResponse: { type: "object", required: ["outcome", "required_actions", "missing_information", "escalation_recommended", "reasons", "pack", "disclaimer", "human_review_recommended", "request_id"], properties: {
          outcome: { type: "string", description: "One of the pack's outcomes for this scenario type" },
          required_actions: { type: "array", items: { type: "object", properties: { id: str, description: str, rule_id: str } } },
          missing_information: { type: "array", items: { type: "object", properties: { path: str, description: str, rule_id: str } } },
          escalation_recommended: { type: "boolean" },
          reasons: { type: "array", items: { type: "object", properties: { rule_id: str, rule_version: str, title: str, explanation: str, outcome: strN, source: { oneOf: [ref("Source"), { type: "null" }] }, effective_from: str, effective_to: strN } } },
          rules_pending_review: { type: "array", description: "Rules marked needs_review that matched. They are NOT applied to the outcome.", items: { type: "object", properties: { rule_id: str, rule_version: str, title: str } } },
          ai_assisted_notes: { oneOf: [{ type: "object", description: "Optional, opt-in, labelled. Never changes the outcome and never decides anything.", properties: { label: str, model: str, notes: { type: "array", items: str }, edge_cases: { type: "array", items: str }, questions: { type: "array", items: str } } }, { type: "null" }] },
          ai_status: { enum: ["not_requested", "ok", "unavailable", "timeout", "error", "invalid_output"] },
          pack: { type: "object", properties: { id: str, version: str, status: { enum: ["draft", "beta", "verified"] } } },
          disclaimer: str, human_review_recommended: { type: "boolean" }, test_mode: { type: "boolean" }, request_id: str } },
        PackRule: { allOf: [js(RuleSchema, "Rule"), { type: "object", properties: { pack: str } }] },
        PackObligation: { allOf: [js(ObligationSchema, "Obligation"), { type: "object", properties: { pack: str, pack_status: str } }] },
        AuditRecord: { type: "object", properties: { request_id: str, endpoint: str, pack: { type: ["object", "null"], properties: { id: str, version: str } }, rule_versions: { type: ["object", "null"], additionalProperties: str }, inputs_hash: { type: "string", description: "SHA-256 of the canonical JSON inputs. Raw inputs are never stored." }, output: {}, model: strN, test: { type: "boolean" }, created_at: dt } },
        UsageRow: { type: "object", properties: { packId: strN, endpoint: str, test: { type: "boolean" }, count: { type: "integer" } } },
        ApiKey: { type: "object", properties: { id: str, name: str, prefix: str, mode: { enum: ["test", "live"] }, scopes: { type: "array", items: str }, rate_limit_per_minute: { type: "integer" }, created_at: dt, revoked_at: { type: ["string", "null"] }, rotated_from: strN } },
        ApiKeyCreated: { allOf: [ref("ApiKey"), { type: "object", required: ["key"], properties: { key: { type: "string", description: "Shown once" } } }] },
        Webhook: { type: "object", properties: { id: str, url: str, events: { type: "array", items: { enum: [...WEBHOOK_EVENTS] } }, packs: { type: "array", items: str }, created_at: dt } },
        WebhookCreated: { allOf: [ref("Webhook"), { type: "object", required: ["secret"], properties: { secret: { type: "string", description: "Signing secret, shown once" } } }] },
        WebhookDelivery: { type: "object", properties: { id: str, event: str, status: { enum: ["pending", "succeeded", "failed"] }, attempts: { type: "integer" }, last_status_code: { type: ["integer", "null"] }, last_error: strN, next_attempt_at: { type: ["string", "null"] }, created_at: dt, delivered_at: { type: ["string", "null"] } } },
        ...hoisted, // evaluated last so defs hoisted by the schemas above are included
      },
    },
  };
}

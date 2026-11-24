import type { components, operations } from "./generated/schema.ts";

type S = components["schemas"];
type Body<Op extends keyof operations> = operations[Op] extends { requestBody: { content: { "application/json": infer B } } } ? B : never;
type Query<Op extends keyof operations> = operations[Op] extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;
type Ok<Op extends keyof operations> = operations[Op] extends { responses: { 200: { content: { "application/json": infer R } } } } ? R : never;

// ---- what the API returns
export type Pack = S["Pack"];
export type PackDetail = S["PackDetail"];
/** The result of an assessment: the outcome, what to do, the reasons with their sources, and the notices a person should see. */
export type Assessment = S["AssessResponse"];
export type Rule = S["PackRule"];
export type Obligation = S["PackObligation"];
export type AuditRecord = S["AuditRecord"];
export type ApiKey = S["ApiKey"];
/** Returned once, when a key is created or rotated. `key` is the plaintext key (publishable keys can also be shown again from the dashboard). */
export type ApiKeyCreated = S["ApiKeyCreated"];
export type Webhook = S["Webhook"];
/** Returned once. `secret` signs every delivery: store it now. */
export type WebhookCreated = S["WebhookCreated"];
export type WebhookDelivery = S["WebhookDelivery"];
export type UsageRow = S["UsageRow"];
export type Jurisdiction = Body<"assess">["jurisdiction"];

// ---- what you send
export type AssessParams = Body<"assess">;
export type CreateKeyParams = Body<"createKey">;
export type UpdateKeyParams = Body<"updateKey">;
export type CreateWebhookParams = Body<"createWebhook">;
export type ListAuditParams = Query<"listAudit">;
export type ListRulesParams = Query<"listRules">;
export type ListObligationsParams = Query<"listObligations">;
export type GetUsageParams = Query<"getUsage">;

export type ListPacksResponse = Ok<"listPacks">;
export type ListRulesResponse = Ok<"listRules">;
export type ListObligationsResponse = Ok<"listObligations">;
export type UsageResponse = Ok<"getUsage">;
export type RuleVersionsResponse = Ok<"getRule">;

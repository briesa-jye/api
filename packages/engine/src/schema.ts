import { z } from "zod";

export const JURISDICTIONS = ["AU", "ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

const slug = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "lowercase letters, digits, - or _");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const path = z.string().regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/, "dot path like party.type");

export const OPS = ["eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte", "exists", "missing", "contains"] as const;
export type Op = (typeof OPS)[number];

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { path: string; op: Op; value?: unknown };

const leaf = z
  .strictObject({ path, op: z.enum(OPS), value: z.unknown().optional() })
  .superRefine((c, ctx) => {
    const needsValue = c.op !== "exists" && c.op !== "missing";
    if (needsValue && c.value === undefined) ctx.addIssue({ code: "custom", message: `op '${c.op}' needs a value` });
    if (!needsValue && c.value !== undefined) ctx.addIssue({ code: "custom", message: `op '${c.op}' takes no value` });
    if ((c.op === "in" || c.op === "not_in") && !Array.isArray(c.value)) {
      ctx.addIssue({ code: "custom", message: `op '${c.op}' needs an array value` });
    }
  });

// Declarative only: a small closed vocabulary, no expressions, no code.
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ConditionSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionSchema).min(1) }),
    z.strictObject({ not: ConditionSchema }),
    leaf as unknown as z.ZodType<Condition>,
  ]),
);

export const SourceSchema = z.strictObject({
  instrument: z.string().min(1),
  section: z.string().optional(),
  url: z.string().url().optional(),
  retrieved: isoDate.optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const RuleSchema = z.strictObject({
  id: slug,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver"),
  title: z.string().min(1),
  description: z.string().min(1),
  scenario_types: z.array(slug).optional(),
  jurisdictions: z.array(z.enum(JURISDICTIONS)).min(1),
  when: ConditionSchema,
  then: z.strictObject({
    outcome: z.string().optional(),
    required_actions: z.array(z.strictObject({ id: slug, description: z.string().min(1) })).optional(),
    missing_information: z.array(z.strictObject({ path, description: z.string().min(1) })).optional(),
    escalate: z.boolean().optional(),
    reason: z.string().optional(),
  }),
  source: SourceSchema.optional(),
  effective_from: isoDate,
  effective_to: isoDate.nullable().optional(),
  status: z.enum(["active", "needs_review", "retired"]),
});
export type Rule = z.infer<typeof RuleSchema>;

export const ObligationSchema = z.strictObject({
  id: slug,
  title: z.string().min(1),
  description: z.string().min(1),
  applies_to: z.array(z.string().min(1)).min(1),
  jurisdictions: z.array(z.enum(JURISDICTIONS)).min(1),
  deadline: z.string().optional(),
  source: SourceSchema.optional(),
  effective_from: isoDate,
  effective_to: isoDate.nullable().optional(),
  status: z.enum(["active", "needs_review", "retired"]),
});
export type Obligation = z.infer<typeof ObligationSchema>;

export const ScenarioFixtureSchema = z.strictObject({
  id: slug,
  synthetic: z.literal(true), // fixtures must be clearly marked as made-up
  scenario_type: slug,
  jurisdiction: z.enum(JURISDICTIONS),
  as_of: isoDate,
  inputs: z.record(z.string(), z.unknown()),
  expect: z.strictObject({
    outcome: z.string(),
    escalation_recommended: z.boolean().optional(),
    action_ids: z.array(z.string()).optional(),
    reason_rule_ids: z.array(z.string()).optional(),
    missing_paths: z.array(z.string()).optional(),
  }),
});
export type ScenarioFixture = z.infer<typeof ScenarioFixtureSchema>;

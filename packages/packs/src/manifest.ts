import { JURISDICTIONS } from "@briesa/engine";
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);

export const ManifestSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  industry: z.string().min(1),
  regulators: z.array(z.string().min(1)),
  jurisdictions: z.array(z.enum(JURISDICTIONS)).min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(["draft", "beta", "verified"]),
  maintainers: z.array(z.string().min(1)).min(1),
  licence_tier: z.string().min(1).default("standard"),
  reviewer: z
    .strictObject({
      name: z.string().min(1),
      verified_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      source_version: z.string().min(1),
    })
    .nullable()
    .optional(),
  scenario_types: z.record(
    slug,
    z.strictObject({
      description: z.string().min(1),
      input_schema: z.string().min(1), // path relative to the pack directory
      outcome: z.strictObject({ order: z.array(z.string().min(1)).min(1), default: z.string().min(1) }),
    }),
  ),
});
export type Manifest = z.infer<typeof ManifestSchema>;

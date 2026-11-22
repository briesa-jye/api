type Obj = Record<string, any>;

function props(schema: Obj | undefined, spec: Obj, depth = 0): string[] {
  if (!schema) return [];
  if (schema.$ref) return props(spec.components.schemas[schema.$ref.split("/").pop()!], spec, depth);
  if (schema.allOf) return schema.allOf.flatMap((s: Obj) => props(s, spec, depth));
  const required = new Set<string>(schema.required ?? []);
  return Object.entries((schema.properties ?? {}) as Obj).map(([k, v]) => {
    const t = v.$ref ? v.$ref.split("/").pop() : Array.isArray(v.type) ? v.type.join(" | ") : v.enum ? v.enum.map((e: string) => `\`${e}\``).join(" \\| ") : v.type ?? "any";
    return `| \`${k}\` | ${t} | ${required.has(k) ? "yes" : "no"} | ${(v.description ?? "").replace(/\|/g, "\\|")} |`;
  });
}

/** Renders docs/reference.md from the OpenAPI document, so the reference can never drift from the spec. */
export function renderReference(spec: Obj): string {
  const out: string[] = [`# ${spec.info.title} reference`, "", `Version ${spec.info.version}. Generated from \`docs/openapi.json\`: do not edit by hand (\`pnpm docs:generate\`).`, "", spec.info.description, "", "All requests use `Authorization: Bearer <key>`. Errors have the shape `{ \"error\": { \"type\", \"code\", \"message\", \"request_id\" } }`.", ""];
  for (const tag of spec.tags) {
    out.push(`## ${tag.name}`, "");
    for (const [path, ops] of Object.entries(spec.paths as Obj)) {
      for (const [method, op] of Object.entries(ops as Obj)) {
        if (op.tags[0] !== tag.name) continue;
        out.push(`### \`${method.toUpperCase()} ${path}\``, "", `**${op.summary}**`, "");
        if (op.description) out.push(op.description, "");
        out.push(op["x-required-scope"] ? `Required scope: \`${op["x-required-scope"]}\`` : "Public (no key needed).", "");
        const params = (op.parameters ?? []) as Obj[];
        if (params.length) {
          out.push("| Parameter | In | Required | Description |", "|---|---|---|---|", ...params.map((p) => `| \`${p.name}\` | ${p.in} | ${p.required ? "yes" : "no"} | ${p.description ?? ""} |`), "");
        }
        const body = op.requestBody?.content?.["application/json"]?.schema;
        if (body) out.push("Request body:", "", "| Field | Type | Required | Description |", "|---|---|---|---|", ...props(body, spec), "");
        out.push(`Responses: ${Object.keys(op.responses).map((c) => `\`${c}\``).join(", ")}`, "");
      }
    }
  }
  out.push("## Webhook events", "");
  for (const [name, w] of Object.entries(spec.webhooks as Obj)) {
    out.push(`### \`${name}\``, "", (w as Obj).post.description, "");
  }
  return out.join("\n") + "\n";
}

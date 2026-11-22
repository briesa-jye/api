/** Defence in depth: scrub obvious identifiers from any string before it could reach a model. */
const luhn = (digits: string) => {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
};

export function redactText(input: string): string {
  return input
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[EMAIL]")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/\b\d[\d -]{11,22}\d\b/g, (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 13 && d.length <= 19 && luhn(d) ? "[CARD]" : m;
    })
    .replace(/(\+?61|\b0)[\s-]?[2-478](?:[\s-]?\d){8}\b/g, "[PHONE]")
    .replace(/\b\d{2}[/-]\d{2}[/-]\d{2,4}\b/g, "[DATE]")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[DATE]")
    .replace(/\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g, "[ID_NUMBER]") // TFN-shaped
    .replace(/\b\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g, "[ID_NUMBER]") // ABN-shaped
    .replace(/\b\d{10}\b/g, "[ID_NUMBER]"); // Medicare-shaped
}

type Json = { [k: string]: unknown };

/**
 * Reduce caller inputs to non-identifying structured facts, guided by the pack's own input schema.
 * Keeps only booleans, numbers and enum-constrained strings. Free text, identifiers and anything
 * the schema does not describe are dropped, so no free text can carry instructions or PII to the model.
 */
export function factsForModel(inputs: Json, schema: Json): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const walk = (value: unknown, sch: Json | undefined, path: string) => {
    if (!sch) return;
    if (sch.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      const props = (sch.properties ?? {}) as Record<string, Json>;
      for (const [k, v] of Object.entries(value as Json)) walk(v, props[k], path ? `${path}.${k}` : k);
      return;
    }
    if (typeof value === "boolean" && sch.type === "boolean") out[path] = value;
    else if (typeof value === "number" && (sch.type === "number" || sch.type === "integer")) out[path] = value;
    else if (typeof value === "string" && Array.isArray(sch.enum) && sch.enum.includes(value)) out[path] = redactText(value);
  };
  walk(inputs, schema, "");
  return out;
}

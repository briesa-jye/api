import { z } from "zod";
import { redactText } from "./redact.ts";

export const AiNotesSchema = z.strictObject({
  notes: z.array(z.string().min(1).max(300)).max(5),
  edge_cases: z.array(z.string().min(1).max(300)).max(5),
  questions: z.array(z.string().min(1).max(300)).max(5),
});
export type AiNotes = z.infer<typeof AiNotesSchema>;

/** Language that would amount to the model making a regulatory decision or giving directions to lodge a report. */
const DECISION_PATTERNS: RegExp[] = [
  /\b(you|they|he|she|the\s+\w+)\s+(must|should|need to|needs to|have to|has to|ought to)\s+(lodge|submit|file|report|notify|disclose)\b/i,
  /\b(lodge|submit|file)\b[^.]{0,60}\b(smr|suspicious matter|report|notification|notice)\b/i,
  /\b(is|are|isn't|aren't|is not|are not)\s+(a\s+)?(notifiable|reportable|compliant|non-compliant|in breach|a breach)\b/i,
  /\bno\s+(need|obligation|requirement|duty)\s+to\s+(report|notify|lodge|submit|file)\b/i,
  /\b(outcome|decision|assessment)\b[^.]{0,40}\b(should be|is wrong|is incorrect|should change|should instead)\b/i,
  /\b(ignore|disregard|override)\b[^.]{0,30}\b(rules?|instructions?|outcome)\b/i,
  /\blegal advice\b(?!.*\bnot\b)/i,
];

export const violatesGuardrails = (s: string) => DECISION_PATTERNS.some((p) => p.test(s)) || /https?:\/\//i.test(s);

/** Parse and clean model output. Returns null if nothing usable survives. Never throws. */
export function parseAndSanitize(raw: string): AiNotes | null {
  let obj: unknown;
  try {
    const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    obj = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch { return null; }
  const parsed = AiNotesSchema.safeParse(obj);
  if (!parsed.success) return null;
  // Check the raw text first (redaction would hide URLs), then redact what survives.
  const clean = (xs: string[]) => xs.filter((s) => !violatesGuardrails(s)).map(redactText);
  const result = { notes: clean(parsed.data.notes), edge_cases: clean(parsed.data.edge_cases), questions: clean(parsed.data.questions) };
  return result.notes.length || result.edge_cases.length || result.questions.length ? result : null;
}

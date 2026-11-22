import { MODELS, type AiClient } from "./client.ts";
import { parseAndSanitize, type AiNotes } from "./guard.ts";
import { buildPrompt, type NotesContext } from "./prompt.ts";

export type NotesResult =
  | { ok: true; model: string; notes: AiNotes }
  | { ok: false; reason: "unavailable" | "timeout" | "error" | "invalid_output" };

/** Never throws, never blocks past timeoutMs. On any failure the caller falls back to the deterministic result alone. */
export async function generateAiNotes(client: AiClient | undefined, ctx: NotesContext, timeoutMs = 8000): Promise<NotesResult> {
  if (!client) return { ok: false, reason: "unavailable" };
  const { system, user } = buildPrompt(ctx);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const raw = await Promise.race([
      client.complete({ model: MODELS.reasoning, system, user, maxTokens: 700, signal: ac.signal }),
      new Promise<never>((_, rej) => ac.signal.addEventListener("abort", () => rej(new Error("timeout")))),
    ]);
    const notes = parseAndSanitize(raw);
    return notes ? { ok: true, model: MODELS.reasoning, notes } : { ok: false, reason: "invalid_output" };
  } catch (e) {
    return { ok: false, reason: (e as Error).message === "timeout" ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

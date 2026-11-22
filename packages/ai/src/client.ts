export const MODELS = {
  /** Reasoning and explanation drafting. */
  reasoning: "claude-sonnet-5-5",
  /** Cheap classification and extraction (not used by any endpoint yet). */
  classification: "claude-haiku-5-5",
} as const;

export interface AiClient {
  complete(req: { model: string; system: string; user: string; maxTokens: number; signal: AbortSignal }): Promise<string>;
}

export class AnthropicClient implements AiClient {
  private apiKey: string;
  private fetchFn: typeof fetch;
  constructor(apiKey: string, fetchFn: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }
  async complete(req: { model: string; system: string; user: string; maxTokens: number; signal: AbortSignal }) {
    const res = await this.fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: req.signal,
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: req.model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: "user", content: req.user }] }),
    });
    if (!res.ok) throw new Error(`model request failed: HTTP ${res.status}`); // body not included: may echo input
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }
}

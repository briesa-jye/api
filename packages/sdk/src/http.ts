import { AbortedError, APIError, BriesaError, ConnectionError, makeApiError, RateLimitError, TimeoutError, IdempotencyError } from "./errors.ts";

export const DEFAULT_BASE_URL = "https://briesa-api.fly.dev";

export interface ResponseInfo { method: string; path: string; status: number; requestId: string | null; attempt: number; headers: Headers }

export interface ClientOptions {
  /** A secret key (`bk_...`) on a server, or a publishable key (`pk_...`) in a browser. Defaults to the BRIESA_API_KEY environment variable where there is one. */
  apiKey?: string;
  /** Defaults to the production API. */
  baseUrl?: string;
  /** Per attempt. Default 30 000. */
  timeoutMs?: number;
  /** Retries after the first attempt, for failures that are safe to repeat. Default 2. */
  maxRetries?: number;
  /** Your own fetch (a proxy, a test double). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Secret keys are refused in a browser, because the key is then visible to every visitor. Only set this if you know what you are doing. */
  dangerouslyAllowBrowser?: boolean;
  /** First retry delay; later ones double, with jitter. Default 500. */
  retryBaseMs?: number;
  /** Longest wait the SDK will accept before retrying, including a server's Retry-After. Default 30 000. Beyond it the error is thrown. */
  maxRetryDelayMs?: number;
  /** Called after every response, including errors and retried attempts. For metrics and logging; never receives bodies. */
  onResponse?: (info: ResponseInfo) => void;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  /** assess() sends one automatically (the same on every retry). Supply your own to make your own retries safe too. */
  idempotencyKey?: string;
}

export interface CallSpec {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** True when repeating the request cannot do harm: reads, deletes, and writes the API deduplicates by Idempotency-Key. */
  safeToRepeat: boolean;
  idempotencyKey?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export class HttpClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  private readonly o: Required<Pick<ClientOptions, "timeoutMs" | "maxRetries" | "retryBaseMs" | "maxRetryDelayMs">> & Pick<ClientOptions, "fetch" | "onResponse">;

  constructor(opts: ClientOptions = {}) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const apiKey = opts.apiKey ?? env?.BRIESA_API_KEY;
    if (!apiKey) throw new BriesaError("No API key. Pass { apiKey } or set the BRIESA_API_KEY environment variable.");
    const inBrowser = typeof (globalThis as { window?: unknown }).window !== "undefined" && typeof (globalThis as { document?: unknown }).document !== "undefined";
    if (inBrowser && apiKey.startsWith("bk_") && !opts.dangerouslyAllowBrowser) {
      throw new BriesaError("A secret key (bk_...) must never be used in a browser: every visitor could read it. Use a publishable key (pk_...), or call the API from your server.");
    }
    const base = (opts.baseUrl ?? (env?.BRIESA_BASE_URL || DEFAULT_BASE_URL)).replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) throw new BriesaError(`baseUrl must start with http:// or https:// (got "${base}").`);
    this.apiKey = apiKey;
    this.baseUrl = base;
    this.o = {
      timeoutMs: opts.timeoutMs ?? 30_000, maxRetries: opts.maxRetries ?? 2, retryBaseMs: opts.retryBaseMs ?? 500,
      maxRetryDelayMs: opts.maxRetryDelayMs ?? 30_000, fetch: opts.fetch, onResponse: opts.onResponse,
    };
  }

  private url(path: string, query?: CallSpec["query"]): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
    const s = qs.toString();
    return `${this.baseUrl}${path}${s ? `?${s}` : ""}`;
  }

  /** The delay before retry number `attempt` (0-based): exponential with full jitter, unless the server said how long to wait. */
  private delay(attempt: number, retryAfterSeconds: number | null): number {
    if (retryAfterSeconds !== null) return retryAfterSeconds * 1000;
    return Math.random() * this.o.retryBaseMs * 2 ** attempt;
  }

  /** Whether a failure should be tried again. Writes the API cannot deduplicate are never repeated after a failure that might have been processed. */
  private retryable(err: unknown, safe: boolean): boolean {
    if (err instanceof RateLimitError) return err.code === "rate_limited"; // refused before processing, so always safe; a monthly cap will not clear in seconds
    if (err instanceof IdempotencyError) return safe && err.code === "request_in_progress";
    if (err instanceof APIError) return safe && err.status >= 500 && err.status !== 501;
    if (err instanceof ConnectionError) return safe; // includes timeouts: the request may have been processed
    return false;
  }

  async request<T>(spec: CallSpec, opts: RequestOptions = {}): Promise<T> {
    const doFetch = this.o.fetch ?? globalThis.fetch;
    if (typeof doFetch !== "function") throw new BriesaError("No fetch available. Use Node 18 or later, a modern browser, or pass { fetch }.");
    const maxRetries = opts.maxRetries ?? this.o.maxRetries;
    const timeoutMs = opts.timeoutMs ?? this.o.timeoutMs;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (spec.body !== undefined) headers["Content-Type"] = "application/json";
    const idem = opts.idempotencyKey ?? spec.idempotencyKey;
    if (idem) headers["Idempotency-Key"] = idem;
    const body = spec.body === undefined ? undefined : JSON.stringify(spec.body);

    for (let attempt = 0; ; attempt++) {
      let failure: unknown;
      let retryAfter: number | null = null;
      const ctl = new AbortController();
      let timedOut = false;
      const onAbort = () => ctl.abort();
      if (opts.signal) { if (opts.signal.aborted) throw new AbortedError(); opts.signal.addEventListener("abort", onAbort, { once: true }); }
      const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
      try {
        const res = await doFetch(this.url(spec.path, spec.query), { method: spec.method, headers, body, signal: ctl.signal });
        const requestId = res.headers.get("x-request-id");
        this.o.onResponse?.({ method: spec.method, path: spec.path, status: res.status, requestId, attempt, headers: res.headers });
        const text = await res.text();
        let data: unknown = null;
        if (text) { try { data = JSON.parse(text); } catch { /* not JSON: a proxy's error page */ } }
        if (res.ok) return data as T;
        const ra = Number(res.headers.get("retry-after"));
        retryAfter = Number.isFinite(ra) && ra >= 0 && res.headers.get("retry-after") !== null ? ra : null;
        failure = makeApiError(res.status, data, retryAfter);
      } catch (e) {
        if (timedOut) failure = new TimeoutError(timeoutMs);
        else if (opts.signal?.aborted) throw new AbortedError();
        else failure = new ConnectionError(undefined, { cause: e });
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
      }
      if (attempt < maxRetries && this.retryable(failure, spec.safeToRepeat)) {
        const wait = this.delay(attempt, failure instanceof RateLimitError || failure instanceof IdempotencyError ? retryAfter : null);
        if (wait <= this.o.maxRetryDelayMs) { await sleep(wait); continue; }
      }
      throw failure;
    }
  }
}

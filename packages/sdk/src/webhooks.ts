import { BriesaError } from "./errors.ts";

export interface WebhookEnvelope<Type extends string, Data> {
  /** `evt_...`. The same event is never sent with a different id, so keep ids you have processed to ignore repeats. */
  id: string;
  type: Type;
  /** Unix seconds. */
  created: number;
  livemode: boolean;
  data: Data;
}

/** Sent after every assessment. It carries the outcome, never the inputs. */
export type AssessmentCompletedEvent = WebhookEnvelope<"assessment.completed", {
  request_id: string;
  pack: { id: string; version: string; status: string };
  scenario_type: string;
  jurisdiction: string;
  outcome: string;
  escalation_recommended: boolean;
  human_review_recommended: boolean;
}>;
export type RulesUpdatedEvent = WebhookEnvelope<"rules.updated", { pack: string; version: string | null; rules: { added: unknown[]; changed: unknown[]; removed: unknown[] } }>;
export type PackUpdatedEvent = WebhookEnvelope<"pack.updated", { pack: string; change: string; from: unknown; to: unknown }>;
export type WebhookEvent = AssessmentCompletedEvent | RulesUpdatedEvent | PackUpdatedEvent;

/** The signature header was missing, malformed, too old, or did not match: do not trust the body. */
export class WebhookSignatureError extends BriesaError {
  constructor(message: string) { super(message); this.name = "WebhookSignatureError"; }
}

export interface VerifyOptions {
  /** How far the signed timestamp may be from now, in seconds. Default 300. */
  toleranceSeconds?: number;
  /** Unix seconds; for tests. */
  now?: number;
}

const enc = new TextEncoder();
const toBytes = (v: string | Uint8Array) => (typeof v === "string" ? enc.encode(v) : v);

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Compares without stopping at the first difference, so timing does not reveal how much matched. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function hmac(secret: string, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new BriesaError("Web Crypto is not available here. Use Node 18 or later, or a modern browser or edge runtime.");
  const key = await subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", key, data));
}

/**
 * Verifies a webhook delivery. Pass the body exactly as received (the raw string or bytes, not re-serialised JSON), the
 * `Briesa-Signature` header and your endpoint's signing secret. Returns true only for a valid, recent signature.
 */
export async function verifyWebhookSignature(rawBody: string | Uint8Array, header: string | null | undefined, secret: string, opts: VerifyOptions = {}): Promise<boolean> {
  if (!header) return false;
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = Number(v); else if (k === "v1") sigs.push(v);
  }
  if (t === null || !Number.isFinite(t) || sigs.length === 0) return false;
  const now = opts.now ?? Date.now() / 1000;
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300)) return false;
  const body = toBytes(rawBody);
  const prefix = enc.encode(`${t}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix); signed.set(body, prefix.length);
  const expected = await hmac(secret, signed);
  return sigs.some((s) => { const got = hexToBytes(s); return got !== null && equalBytes(got, expected); });
}

/** Verifies the signature, then parses the body into a typed event. Throws WebhookSignatureError if it cannot be trusted. */
export async function constructWebhookEvent(rawBody: string | Uint8Array, header: string | null | undefined, secret: string, opts: VerifyOptions = {}): Promise<WebhookEvent> {
  if (!(await verifyWebhookSignature(rawBody, header, secret, opts))) {
    throw new WebhookSignatureError("The webhook signature is missing, invalid or too old. Do not trust this request.");
  }
  try { return JSON.parse(typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody)) as WebhookEvent; }
  catch { throw new WebhookSignatureError("The webhook body is not valid JSON."); }
}

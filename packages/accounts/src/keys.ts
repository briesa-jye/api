import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { KeyKind, KeyMode } from "@briesa/db";

// Format: bk_<mode>_<prefix>_<secret> for secret keys, pk_<mode>_... for publishable keys. Authentication looks a key up by its
// prefix and compares sha256(full key); publishable keys also keep the full key (they are public by design).
export function generateKey(mode: KeyMode, kind: KeyKind = "secret") {
  const prefix = randomBytes(5).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const key = `${kind === "publishable" ? "pk" : "bk"}_${mode}_${prefix}_${secret}`;
  return { key, prefix, hash: hashKey(key) };
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function parseKey(key: string): { kind: KeyKind; mode: KeyMode; prefix: string } | null {
  const m = /^(bk|pk)_(test|live)_([0-9a-f]{10})_[A-Za-z0-9_-]{32}$/.exec(key);
  return m ? { kind: m[1] === "pk" ? "publishable" : "secret", mode: m[2] as KeyMode, prefix: m[3]! } : null;
}

export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Scope check. Scopes: "assess", "read", "audit:read", "keys:manage", "webhooks", "pack:<id>" or "pack:*". */
export const hasScope = (scopes: string[], needed: string) =>
  scopes.includes(needed) || scopes.includes("*");

export const hasPackAccess = (scopes: string[], packId: string) =>
  scopes.includes("*") || scopes.includes("pack:*") || scopes.includes(`pack:${packId}`);

/** The only scopes a publishable key may hold: run assessments, read pack metadata, and named packs (never a wildcard). */
export const PUBLISHABLE_SCOPE = /^(assess|read|pack:[a-z0-9-]+)$/;

// Second-level labels that make "<label>.<cc>" a shared public suffix (com.au, co.uk, nsw.gov is three labels so is not affected). Not a full public suffix list.
const SHARED_SUFFIX_LABELS = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "id", "asn", "mil"]);

const HOST = "(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}";

/**
 * Normalises an allowed origin for a publishable key, or returns null when it is not acceptable. Accepted: https://example.com,
 * https://app.example.com:8443 and https://*.example.com (subdomains only; the wildcard must sit under a real domain, so
 * https://*.com is refused). http://localhost and http://127.0.0.1 are accepted for test keys only. Paths, queries and a bare "*" are refused.
 */
export function normalizeOrigin(raw: string, mode: KeyMode): string | null {
  const o = raw.trim().toLowerCase().replace(/\/$/, "");
  if (new RegExp(`^https://(\\*\\.)?${HOST}(:\\d{1,5})?$`).test(o)) {
    if (o.startsWith("https://*.")) {
      const parent = o.slice("https://*.".length).replace(/:\d+$/, "");
      const labels = parent.split(".");
      // The wildcard must sit under a registrable domain: "*.com" is refused, and so is "*.com.au" or "*.co.uk", which would let every site under that suffix in.
      if (labels.length < 2) return null;
      if (labels.length === 2 && labels[1]!.length === 2 && SHARED_SUFFIX_LABELS.has(labels[0]!)) return null;
    }
    return o;
  }
  if (mode === "test" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(o)) return o;
  return null;
}

/** Whether a browser's Origin header is covered by a publishable key's allowed origins (exact, or subdomain under a *. entry). */
export function originAllowed(allowed: string[], origin: string): boolean {
  const o = origin.trim().toLowerCase();
  if (allowed.includes(o)) return true;
  let u: URL;
  try { u = new URL(o); } catch { return false; }
  if (u.origin !== o) return false; // anything with a path, query or credentials is not an Origin
  return allowed.some((a) => {
    const m = /^(https):\/\/\*\.([^:]+)(?::(\d+))?$/.exec(a);
    return !!m && u.protocol === `${m[1]}:` && u.hostname.endsWith(`.${m[2]}`) && (u.port || "") === (m[3] ?? "");
  });
}

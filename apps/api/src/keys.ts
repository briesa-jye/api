import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { KeyMode } from "@briesa/db";

// Format: bk_<mode>_<prefix>_<secret>. Only prefix and sha256(full key) are stored.
export function generateKey(mode: KeyMode) {
  const prefix = randomBytes(5).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const key = `bk_${mode}_${prefix}_${secret}`;
  return { key, prefix, hash: hashKey(key) };
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function parseKey(key: string): { mode: KeyMode; prefix: string } | null {
  const m = /^bk_(test|live)_([0-9a-f]{10})_[A-Za-z0-9_-]{32}$/.exec(key);
  return m ? { mode: m[1] as KeyMode, prefix: m[2]! } : null;
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

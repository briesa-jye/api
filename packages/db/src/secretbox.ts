import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

/** Parses a 32-byte key given as base64 (or 64 hex characters). Throws on anything else, so a typo cannot silently weaken storage. */
export function parseSecretKey(raw: string): Buffer {
  const hex = /^[0-9a-f]{64}$/i.test(raw);
  const buf = Buffer.from(raw, hex ? "hex" : "base64");
  if (buf.length !== 32) throw new Error("WEBHOOK_SECRET_KEY must be 32 bytes, base64 or hex encoded.");
  return buf;
}

export const isEncrypted = (s: string) => s.startsWith(PREFIX);

/** AES-256-GCM. Output is `enc:v1:<iv>.<tag>.<ciphertext>` (base64url). A fresh random IV every call. */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

/** Decrypts a stored value. Values without the prefix are legacy plaintext and pass through. */
export function decryptSecret(stored: string, key: Buffer | null): string {
  if (!isEncrypted(stored)) return stored;
  if (!key) throw new Error("A webhook secret is encrypted but WEBHOOK_SECRET_KEY is not set.");
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(".");
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret.");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

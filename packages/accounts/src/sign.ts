import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/** Header value: `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<body>">`. */
export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

/** Reference verifier for receivers (also used in tests and the docs). */
export function verify(secret: string, body: string, header: string, toleranceSec = 300, now = Date.now() / 1000): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now - t) > toleranceSec) return false;
  const expected = Buffer.from(sign(secret, body, t).split("v1=")[1]!, "hex");
  const got = Buffer.from(parts.v1, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

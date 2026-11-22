import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}

function privateIPv4(ip: string) {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
}
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateIPv4(ip);
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  return m ? privateIPv4(m[1]!) : false;
}

/** Static check done when an endpoint is registered. */
export function checkUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeUrlError("Not a valid URL."); }
  if (u.protocol !== "https:") throw new UnsafeUrlError("Webhook URLs must use https.");
  if (u.username || u.password) throw new UnsafeUrlError("Webhook URLs must not contain credentials.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Webhook URLs must be publicly reachable.");
  }
  if (isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError("Webhook URLs must not point to private addresses.");
  return u;
}

export type Resolver = (hostname: string) => Promise<string[]>;
export const dnsResolver: Resolver = async (h) => (await lookup(h, { all: true })).map((r) => r.address);

/** Re-checked at delivery time, so DNS changes after registration cannot reach internal addresses. */
export async function assertPublicDestination(raw: string, resolve: Resolver = dnsResolver): Promise<void> {
  const u = checkUrlShape(raw);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : await resolve(host);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new UnsafeUrlError("Destination resolves to a private address.");
}

/** Only same-site relative paths: blocks open redirects such as //evil.example or /\evil.example. */
export function sameOriginPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}

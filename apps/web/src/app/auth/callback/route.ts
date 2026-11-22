import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured, supabaseServer } from "@/lib/auth";
import { sameOriginPath } from "@/lib/redirect";

/** Completes email-confirmation and magic-link sign-ins. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const next = sameOriginPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (code && supabaseConfigured()) {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/login?error=link_expired&next=${encodeURIComponent(next)}`, url.origin));
}

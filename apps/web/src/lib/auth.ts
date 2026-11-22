import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export const supabaseConfigured = () => !!(supabaseUrl() && supabaseKey());
/** Local preview only: pretends a demo user is signed in. Never active in production. */
export const demoMode = () => process.env.NODE_ENV !== "production" && process.env.DEMO_AUTH === "1";

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(supabaseUrl()!, supabaseKey()!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // Server Components cannot set cookies; the proxy refreshes the session instead.
        try { for (const { name, value, options } of list) jar.set(name, value, options); } catch {}
      },
    },
  });
}

export interface SessionUser { id: string; email: string }

/** Validates the session with Supabase (not just the cookie), so a forged or revoked token is rejected. */
export async function getUser(): Promise<SessionUser | null> {
  if (demoMode()) return { id: "demo-user", email: "demo@example.com" };
  if (!supabaseConfigured()) return null;
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user?.email ? { id: data.user.id, email: data.user.email } : null;
}

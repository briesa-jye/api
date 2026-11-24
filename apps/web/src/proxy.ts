import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out visitors out of /dashboard and /check.
 * (Next 16 renamed middleware to proxy.) Pages still validate the user themselves; this is a first gate.
 */
export async function proxy(req: NextRequest) {
  const url = supabaseUrl(), key = supabaseKey();
  const demo = process.env.NODE_ENV !== "production" && process.env.DEMO_AUTH === "1";
  let res = NextResponse.next({ request: req });
  if (demo) return res;

  let signedIn = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  }
  if (!signedIn && (req.nextUrl.pathname.startsWith("/dashboard") || req.nextUrl.pathname.startsWith("/check"))) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|fonts/).*)"] };

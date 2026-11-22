"use server";

import { redirect } from "next/navigation";
import { demoMode, supabaseConfigured, supabaseServer } from "@/lib/auth";
import { sameOriginPath } from "@/lib/redirect";
import { SITE_URL } from "@/lib/site";

const MIN_PASSWORD = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Errors are shown from a fixed set of codes, never from raw provider text. */
const to = (path: "/login" | "/signup", code: string, next: string) => redirect(`${path}?error=${code}&next=${encodeURIComponent(next)}`);

function read(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: String(form.get("password") ?? ""),
    next: sameOriginPath(String(form.get("next") ?? "")),
  };
}

export async function signIn(form: FormData) {
  const { email, password, next } = read(form);
  if (demoMode()) redirect(next);
  if (!supabaseConfigured()) to("/login", "not_configured", next);
  if (!EMAIL.test(email) || !password) to("/login", "invalid", next);
  const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
  if (error) to("/login", "credentials", next);
  redirect(next);
}

export async function signUp(form: FormData) {
  const { email, password, next } = read(form);
  if (!supabaseConfigured()) to("/signup", "not_configured", next);
  if (!EMAIL.test(email)) to("/signup", "invalid", next);
  if (password.length < MIN_PASSWORD) to("/signup", "weak_password", next);
  const { data, error } = await (await supabaseServer()).auth.signUp({
    email, password, options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) to("/signup", "signup_failed", next);
  if (data.session) redirect(next); // email confirmation disabled: signed in immediately
  redirect(`/login?message=check_email&next=${encodeURIComponent(next)}`);
}

export async function magicLink(form: FormData) {
  const { email, next } = read(form);
  if (!supabaseConfigured()) to("/login", "not_configured", next);
  if (!EMAIL.test(email)) to("/login", "invalid", next);
  await (await supabaseServer()).auth.signInWithOtp({ email, options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` } });
  // Same message whether or not the address exists, so this cannot be used to probe for accounts.
  redirect(`/login?message=check_email&next=${encodeURIComponent(next)}`);
}

export async function signOut() {
  if (supabaseConfigured() && !demoMode()) await (await supabaseServer()).auth.signOut();
  redirect("/");
}

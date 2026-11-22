import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/input";
import { magicLink, signIn, signUp } from "@/app/(auth)/actions";

const ERRORS: Record<string, string> = {
  credentials: "That email and password did not match. Check them and try again.",
  invalid: "Enter a valid email address and your password.",
  weak_password: "Use a password of at least 10 characters.",
  signup_failed: "We could not create that account. If you already have one, sign in instead.",
  link_expired: "That sign-in link has expired or was already used. Request a new one.",
  not_configured: "Sign-in is not configured on this deployment yet.",
};
const MESSAGES: Record<string, string> = { check_email: "Check your email. We sent a link to finish signing in." };

export function AuthForm({ mode, error, message, next }: { mode: "login" | "signup"; error?: string; message?: string; next: string }) {
  const isLogin = mode === "login";
  return (
    <div className="bg-card w-full max-w-md rounded-xl border p-7 sm:p-8">
      <h1 className="text-3xl tracking-tighter">{isLogin ? "Sign in" : "Create your account"}</h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        {isLogin ? "Welcome back. Manage your keys, usage and billing." : "Free test keys, no card needed."}
      </p>

      <div className="mt-6 space-y-3">
        {error && <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Please try again."}</Notice>}
        {message && MESSAGES[message] && <Notice tone="success">{MESSAGES[message]}</Notice>}
      </div>

      <form action={isLogin ? signIn : signUp} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={isLogin ? undefined : 10} required />
          {!isLogin && <p className="text-muted-foreground text-xs">At least 10 characters.</p>}
        </div>
        <Button type="submit" variant="brand" size="lg" className="w-full">{isLogin ? "Sign in" : "Create account"}</Button>
      </form>

      {isLogin && (
        <form action={magicLink} className="mt-4 border-t border-dashed pt-4">
          <input type="hidden" name="next" value={next} />
          <p className="text-muted-foreground mb-3 text-xs">Prefer no password? We will email you a sign-in link.</p>
          <MagicEmail />
        </form>
      )}

      <p className="text-muted-foreground mt-6 text-sm">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link href={`${isLogin ? "/signup" : "/login"}?next=${encodeURIComponent(next)}`} className="text-foreground underline underline-offset-4">
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}

function MagicEmail() {
  return (
    <div className="flex gap-2">
      <Input name="email" type="email" aria-label="Email for sign-in link" placeholder="you@company.com" autoComplete="email" required />
      <Button type="submit" variant="outline" className="h-10 shrink-0">Email me a link</Button>
    </div>
  );
}

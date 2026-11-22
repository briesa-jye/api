import type { Metadata } from "next";
import { AuthForm } from "@/components/site/AuthForm";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sameOriginPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getUser()) redirect(sameOriginPath(sp.next)); // already signed in
  return <AuthForm mode="login" error={sp.error} message={sp.message} next={sameOriginPath(sp.next)} />;
}

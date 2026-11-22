import type { Metadata } from "next";
import { AuthForm } from "@/components/site/AuthForm";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sameOriginPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getUser()) redirect(sameOriginPath(sp.next)); // already signed in
  return <AuthForm mode="signup" error={sp.error} message={sp.message} next={sameOriginPath(sp.next)} />;
}

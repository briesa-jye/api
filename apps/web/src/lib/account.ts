import "server-only";
import { parsePlans, type Plan } from "@briesa/accounts/plans";
import type { Tenant, TenantMember } from "@briesa/db";
import { redirect } from "next/navigation";
import { demoMode, getUser, type SessionUser } from "@/lib/auth";
import { seedDemo } from "@/lib/demo";
import { getStore } from "@/lib/store";

export const getPlans = (): Plan[] => parsePlans(process.env.BRIESA_PLANS);

export interface Account { user: SessionUser; tenant: Tenant; member: TenantMember }

/** Signed-in user plus their tenant (created on first sign-in). Redirects to /login otherwise. */
export async function requireAccount(): Promise<Account> {
  const user = await getUser();
  if (!user) redirect("/login");
  const store = getStore();
  const { tenant, member, created } = await store.ensureTenantForUser({
    userId: user.id, email: user.email, tenantName: user.email.split("@")[1] ?? user.email,
  });
  if (created && demoMode()) await seedDemo(store, tenant.id);
  return { user, tenant, member };
}

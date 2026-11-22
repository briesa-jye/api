import "server-only";
import { effectiveScopes } from "@briesa/accounts/billing";
import type { Tenant } from "@briesa/db";
import { getRegistry } from "@/lib/packs";

/** Actor for dashboard actions: an owner holds every scope, then plan licensing applies to live access. */
export const ownerActor = (tenant: Tenant, mode: "test" | "live") => ({ tenantId: tenant.id, scopes: effectiveScopes(["*"], tenant, mode) });
export const packExists = (id: string) => !!getRegistry().get(id);
export const allPackIds = () => getRegistry().list().map((p) => p.manifest.id);

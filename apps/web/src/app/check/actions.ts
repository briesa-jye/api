"use server";

import { requireAccount } from "@/lib/account";
import { runCheck, type CheckOutcome, type CheckRequest } from "@/lib/check";
import { getRegistry } from "@/lib/packs";
import { getStore } from "@/lib/store";

/** Runs one check as the signed-in employee. Attributed to them in Audit, counted in Usage. */
export async function runCheckAction(req: CheckRequest): Promise<CheckOutcome> {
  const { user, tenant } = await requireAccount();
  try {
    return await runCheck(getStore(), tenant, user, typeof req?.pack === "string" ? (getRegistry().get(req.pack) ?? undefined) : undefined, req);
  } catch (e) {
    console.error("quick check failed", (e as Error).name); // name only: messages can echo user input
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

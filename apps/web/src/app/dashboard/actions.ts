"use server";

import { liveAccessAllowed } from "@briesa/accounts/billing";
import { createKey, createKeyInput, createWebhook, createWebhookInput, ManageError, revokeKey, rotateKey, zodMessage } from "@briesa/accounts/manage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, getPlans } from "@/lib/account";
import { ownerActor, packExists } from "@/lib/packs-access";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/store";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export type SecretResult = { ok: true; secret: string; label: string } | { ok: false; error: string } | null;

const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof ManageError) return { ok: false, error: e.message };
  console.error("dashboard action failed", (e as Error).name); // name only: messages can echo user input
  return { ok: false, error: "Something went wrong. Please try again." };
};

export async function createKeyAction(_: SecretResult, form: FormData): Promise<SecretResult> {
  const { tenant } = await requireAccount();
  const mode = form.get("mode") === "live" ? "live" : "test";
  const packs = form.getAll("packs").map(String);
  const scopes = [...form.getAll("scopes").map(String), ...(packs.includes("*") ? ["pack:*"] : packs.map((p) => `pack:${p}`))];
  const parsed = createKeyInput.safeParse({ name: String(form.get("name") ?? "").trim(), mode, scopes });
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
  try {
    const { key } = await createKey(getStore(), ownerActor(tenant, mode), parsed.data);
    revalidatePath("/dashboard", "layout");
    return { ok: true, secret: key, label: parsed.data.name };
  } catch (e) { return fail(e); }
}

export async function rotateKeyAction(_: SecretResult, form: FormData): Promise<SecretResult> {
  const { tenant } = await requireAccount();
  try {
    const { key, record } = await rotateKey(getStore(), tenant.id, String(form.get("id")));
    revalidatePath("/dashboard/keys");
    return { ok: true, secret: key, label: `${record.name} (rotated)` };
  } catch (e) { return fail(e); }
}

/** The key id is bound in (revokeKeyAction.bind(null, id)): a button with a function formAction cannot carry a name. */
export async function revokeKeyAction(id: string, _form: FormData) {
  const { tenant } = await requireAccount();
  try { await revokeKey(getStore(), tenant.id, id); } catch (e) { console.error("revoke failed", (e as Error).name); }
  revalidatePath("/dashboard/keys");
}

export async function createWebhookAction(_: SecretResult, form: FormData): Promise<SecretResult> {
  const { tenant } = await requireAccount();
  const packs = form.getAll("packs").map(String);
  const parsed = createWebhookInput.safeParse({
    url: String(form.get("url") ?? "").trim(), events: form.getAll("events").map(String),
    ...(packs.length ? { packs } : {}),
  });
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
  try {
    const { secret, endpoint } = await createWebhook(getStore(), ownerActor(tenant, "live"), parsed.data, packExists);
    revalidatePath("/dashboard/webhooks");
    return { ok: true, secret, label: endpoint.url };
  } catch (e) { return fail(e); }
}

export async function deleteWebhookAction(form: FormData) {
  const { tenant } = await requireAccount();
  await getStore().disableWebhookEndpoint(tenant.id, String(form.get("id")));
  revalidatePath("/dashboard/webhooks");
}

/** Starts Stripe Checkout for a plan. Nothing is charged until the customer completes Checkout on Stripe. */
export async function startCheckout(form: FormData) {
  const { tenant, user } = await requireAccount();
  const plan = getPlans().find((p) => p.id === String(form.get("plan")));
  if (!plan || !stripeConfigured()) redirect("/dashboard/billing?error=unavailable");
  if (tenant.billingExempt) redirect("/dashboard/billing?error=exempt");
  if (liveAccessAllowed(tenant) && tenant.stripeCustomerId) redirect("/dashboard/billing?error=already_subscribed"); // change plans in the portal
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    client_reference_id: tenant.id,
    ...(tenant.stripeCustomerId ? { customer: tenant.stripeCustomerId } : { customer_email: user.email }),
    subscription_data: { metadata: { tenant_id: tenant.id } },
    allow_promotion_codes: true,
    success_url: `${SITE_URL}/dashboard/billing?checkout=success`,
    cancel_url: `${SITE_URL}/dashboard/billing?checkout=cancelled`,
  });
  if (!session.url) redirect("/dashboard/billing?error=unavailable");
  redirect(session.url);
}

export async function openPortal() {
  const { tenant } = await requireAccount();
  if (!tenant.stripeCustomerId || !stripeConfigured()) redirect("/dashboard/billing?error=unavailable");
  const s = await getStripe().billingPortal.sessions.create({ customer: tenant.stripeCustomerId, return_url: `${SITE_URL}/dashboard/billing` });
  redirect(s.url);
}

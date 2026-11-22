import { randomBytes } from "node:crypto";
import type { Store, WebhookDelivery, WebhookEvent } from "@briesa/db";
import { hasPackAccess } from "../keys.ts";
import { sign } from "./sign.ts";
import { assertPublicDestination, type Resolver, dnsResolver } from "./ssrf.ts";

/** Seconds to wait before attempt N+1 after attempt N fails. Six attempts in total. */
export const RETRY_DELAYS_SEC = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = RETRY_DELAYS_SEC.length + 1;

export interface WebhookServiceOptions {
  fetch?: typeof fetch;
  resolver?: Resolver;
  timeoutMs?: number;
  now?: () => Date;
}

export class WebhookService {
  private store: Store;
  private fetchFn: typeof fetch;
  private resolver: Resolver;
  private timeoutMs: number;
  private now: () => Date;

  constructor(store: Store, opts: WebhookServiceOptions = {}) {
    this.store = store;
    this.fetchFn = opts.fetch ?? fetch;
    this.resolver = opts.resolver ?? dnsResolver;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Queue an event. tenantId = only that tenant's endpoints; null = every tenant (system events such as pack.updated),
   * restricted to tenants that still hold a live key with access to the pack.
   */
  async emit(input: { event: WebhookEvent; tenantId: string | null; packId: string; data: Record<string, unknown>; livemode?: boolean }): Promise<number> {
    const endpoints = (await this.store.systemListWebhookEndpoints(input.event))
      .filter((e) => (input.tenantId === null || e.tenantId === input.tenantId) && (e.packs.includes("*") || e.packs.includes(input.packId)));
    const licensed = new Map<string, boolean>();
    let n = 0;
    for (const e of endpoints) {
      if (!licensed.has(e.tenantId)) {
        const keys = await this.store.listApiKeys(e.tenantId);
        licensed.set(e.tenantId, keys.some((k) => !k.revokedAt && hasPackAccess(k.scopes, input.packId)));
      }
      if (!licensed.get(e.tenantId)) continue;
      const eventId = `evt_${randomBytes(12).toString("hex")}`;
      const payload = JSON.stringify({
        id: eventId, type: input.event, created: Math.floor(this.now().getTime() / 1000),
        livemode: input.livemode ?? true, data: input.data,
      });
      await this.store.createWebhookDelivery({ tenantId: e.tenantId, endpointId: e.id, event: input.event, payload, nextAttemptAt: this.now() });
      n++;
    }
    return n;
  }

  /** Attempt one delivery. Never throws. */
  async deliver(d: WebhookDelivery): Promise<void> {
    const endpoint = await this.store.systemGetWebhookEndpoint(d.endpointId);
    const attempts = d.attempts + 1;
    if (!endpoint || endpoint.disabledAt) {
      await this.store.updateWebhookDelivery(d.id, { status: "failed", attempts, lastError: "endpoint unavailable", nextAttemptAt: null });
      return;
    }
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      await assertPublicDestination(endpoint.url, this.resolver);
      const res = await this.fetchFn(endpoint.url, {
        method: "POST",
        redirect: "manual", // never follow redirects into internal addresses
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          "content-type": "application/json",
          "user-agent": "Briesa-Webhooks/1",
          "briesa-event": d.event,
          "briesa-delivery": d.id,
          "briesa-signature": sign(endpoint.secret, d.payload),
        },
        body: d.payload,
      });
      statusCode = res.status;
      if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message.slice(0, 200);
    }
    if (!error) {
      await this.store.updateWebhookDelivery(d.id, { status: "succeeded", attempts, lastStatusCode: statusCode, lastError: null, nextAttemptAt: null, deliveredAt: this.now() });
    } else if (attempts >= MAX_ATTEMPTS) {
      await this.store.updateWebhookDelivery(d.id, { status: "failed", attempts, lastStatusCode: statusCode, lastError: error, nextAttemptAt: null });
    } else {
      const delay = RETRY_DELAYS_SEC[attempts - 1]!;
      await this.store.updateWebhookDelivery(d.id, { attempts, lastStatusCode: statusCode, lastError: error, nextAttemptAt: new Date(this.now().getTime() + delay * 1000) });
    }
  }

  /** Process everything currently due. Returns the number attempted. */
  async runDue(limit = 50): Promise<number> {
    const due = await this.store.claimDueWebhookDeliveries(this.now(), limit, 5 * 60_000);
    await Promise.all(due.map((d) => this.deliver(d)));
    return due.length;
  }

  /** Background poller. Safe across restarts because state lives in the store. */
  start(intervalMs = 5000): () => void {
    let running = false;
    const t = setInterval(async () => {
      if (running) return;
      running = true;
      try { await this.runDue(); } finally { running = false; }
    }, intervalMs);
    t.unref();
    return () => clearInterval(t);
  }
}

import { HttpClient, newId, type CallSpec, type ClientOptions, type RequestOptions } from "./http.ts";
import { Page } from "./pagination.ts";
import type {
  ApiKey, ApiKeyCreated, Assessment, AssessParams, AuditRecord, CreateKeyParams, CreateWebhookParams, GetUsageParams, ListAuditParams,
  ListObligationsParams, ListObligationsResponse, ListPacksResponse, ListRulesParams, ListRulesResponse, PackDetail, RuleVersionsResponse,
  UpdateKeyParams, UsageResponse, Webhook, WebhookCreated, WebhookDelivery,
} from "./types.ts";
import { constructWebhookEvent, verifyWebhookSignature } from "./webhooks.ts";

type Opts = RequestOptions | undefined;
const seg = (s: string) => encodeURIComponent(s);

/**
 * The Briesa Compliance API client.
 *
 *   const briesa = new Briesa({ apiKey: process.env.BRIESA_API_KEY });
 *   const result = await briesa.assess({
 *     pack: "whs-incident-notification", scenario_type: "classify_incident", jurisdiction: "NSW",
 *     inputs: { incident_type: "death", arose_from_work: true },
 *   });
 *   result.outcome;                  // "notifiable"
 *   result.human_review_recommended; // always check this before acting
 *
 * Results are decision support: show the pack's `status` and the `human_review_recommended` flag to the person who acts on them.
 */
export class Briesa {
  readonly baseUrl: string;
  /** "test" or "live", read from the key's prefix; null for a key in a format this version does not know. */
  readonly mode: "test" | "live" | null;
  /** "secret" (server-side) or "publishable" (browser); null if unknown. */
  readonly keyKind: "secret" | "publishable" | null;
  private readonly http: HttpClient;

  constructor(opts: ClientOptions = {}) {
    this.http = new HttpClient(opts);
    this.baseUrl = this.http.baseUrl;
    const m = /^(bk|pk)_(test|live)_/.exec(this.http.apiKey);
    this.keyKind = m ? (m[1] === "pk" ? "publishable" : "secret") : null;
    this.mode = m ? (m[2] as "test" | "live") : null;
  }

  private call<T>(spec: CallSpec, o: Opts): Promise<T> { return this.http.request<T>(spec, o); }

  /** `GET /health`. Does not need a key to be valid. */
  health(o?: Opts): Promise<{ ok: boolean }> { return this.call({ method: "GET", path: "/health", safeToRepeat: true }, o); }

  /**
   * Runs an assessment. Every call carries an Idempotency-Key (yours, or one generated here and reused across automatic retries), so a retry
   * after a dropped connection returns the original result and is never billed twice.
   */
  assess(params: AssessParams, o?: Opts): Promise<Assessment> {
    return this.call({ method: "POST", path: "/v1/assess", body: params, safeToRepeat: true, idempotencyKey: o?.idempotencyKey ?? `sdk_${newId()}` }, o);
  }

  readonly packs = {
    list: (o?: Opts): Promise<ListPacksResponse> => this.call({ method: "GET", path: "/v1/packs", safeToRepeat: true }, o),
    /** The pack's scenario types, their outcomes and the JSON Schema of the inputs each one takes. */
    get: (id: string, o?: Opts): Promise<PackDetail> => this.call({ method: "GET", path: `/v1/packs/${seg(id)}`, safeToRepeat: true }, o),
  };

  readonly rules = {
    list: (params: ListRulesParams = {}, o?: Opts): Promise<ListRulesResponse> => this.call({ method: "GET", path: "/v1/rules", query: params, safeToRepeat: true }, o),
    /** Every version of one rule. */
    get: (id: string, o?: Opts): Promise<RuleVersionsResponse> => this.call({ method: "GET", path: `/v1/rules/${seg(id)}`, safeToRepeat: true }, o),
  };

  readonly obligations = {
    list: (params: ListObligationsParams = {}, o?: Opts): Promise<ListObligationsResponse> => this.call({ method: "GET", path: "/v1/obligations", query: params, safeToRepeat: true }, o),
  };

  readonly audit = {
    get: (requestId: string, o?: Opts): Promise<AuditRecord> => this.call({ method: "GET", path: `/v1/audit/${seg(requestId)}`, safeToRepeat: true }, o),
    /** Newest first. The result is a page you can also iterate across every page: `for await (const r of briesa.audit.list()) { ... }`. */
    list: async (params: Omit<ListAuditParams, "starting_after"> = {}, o?: Opts): Promise<Page<AuditRecord>> => {
      const fetchPage = async (cursor?: string): Promise<Page<AuditRecord>> => {
        const r = await this.call<{ data: AuditRecord[]; has_more: boolean; next_cursor: string | null }>(
          { method: "GET", path: "/v1/audit", query: { ...params, ...(cursor && { starting_after: cursor }) }, safeToRepeat: true }, o);
        return new Page(r.data, r.has_more, r.next_cursor, fetchPage);
      };
      return fetchPage();
    },
  };

  readonly usage = {
    get: (params: GetUsageParams = {}, o?: Opts): Promise<UsageResponse> => this.call({ method: "GET", path: "/v1/usage", query: params, safeToRepeat: true }, o),
  };

  readonly keys = {
    list: (o?: Opts): Promise<{ keys: ApiKey[] }> => this.call({ method: "GET", path: "/v1/keys", safeToRepeat: true }, o),
    /** The plaintext key is in the response once. Needs the `keys:manage` scope. Not retried automatically after an uncertain failure, so it cannot create a key twice. */
    create: (params: CreateKeyParams, o?: Opts): Promise<ApiKeyCreated> => this.call({ method: "POST", path: "/v1/keys", body: params, safeToRepeat: false }, o),
    update: (id: string, params: UpdateKeyParams, o?: Opts): Promise<ApiKey> => this.call({ method: "PATCH", path: `/v1/keys/${seg(id)}`, body: params, safeToRepeat: true }, o),
    /** Creates a replacement with the same settings and revokes the old key immediately. */
    rotate: (id: string, o?: Opts): Promise<ApiKeyCreated> => this.call({ method: "POST", path: `/v1/keys/${seg(id)}/rotate`, safeToRepeat: false }, o),
    revoke: (id: string, o?: Opts): Promise<ApiKey> => this.call({ method: "POST", path: `/v1/keys/${seg(id)}/revoke`, safeToRepeat: true }, o),
  };

  readonly webhooks = {
    list: (o?: Opts): Promise<{ webhooks: Webhook[] }> => this.call({ method: "GET", path: "/v1/webhooks", safeToRepeat: true }, o),
    /** The signing secret is in the response once. */
    create: (params: CreateWebhookParams, o?: Opts): Promise<WebhookCreated> => this.call({ method: "POST", path: "/v1/webhooks", body: params, safeToRepeat: false }, o),
    delete: (id: string, o?: Opts): Promise<{ id: string; deleted: boolean }> => this.call({ method: "DELETE", path: `/v1/webhooks/${seg(id)}`, safeToRepeat: true }, o),
    /** The latest 50 delivery attempts for one endpoint. */
    deliveries: (id: string, o?: Opts): Promise<{ deliveries: WebhookDelivery[] }> => this.call({ method: "GET", path: `/v1/webhooks/${seg(id)}/deliveries`, safeToRepeat: true }, o),
    /** Verifies a delivery's signature and returns the typed event. Needs no network or key. See also the standalone constructWebhookEvent. */
    constructEvent: constructWebhookEvent,
    verifySignature: verifyWebhookSignature,
  };
}

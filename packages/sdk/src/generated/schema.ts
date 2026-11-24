// GENERATED from docs/openapi.json by packages/sdk/scripts/generate.ts. Do not edit by hand.
// Regenerate with: corepack pnpm sdk:generate   (a test fails if this file is out of date)
/* eslint-disable */
export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health check */
        get: operations["health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** This OpenAPI document */
        get: operations["getOpenApi"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/packs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List packs available to your key */
        get: operations["listPacks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/packs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get a pack with its scenario types and input schemas */
        get: operations["getPack"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assess": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run an assessment
         * @description Validates `inputs` against the pack's schema for `scenario_type`, runs the pack's versioned rules, and returns an explainable result. Decision support only: every response carries a disclaimer and a `human_review_recommended` flag, and the result always includes the pack's maturity status. Billable on live keys.
         */
        post: operations["assess"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List rule definitions */
        get: operations["listRules"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/rules/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get all versions of a rule */
        get: operations["getRule"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/obligations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List obligations in force
         * @description Obligations with source references, effective dates and deadlines. Defaults to today's date in Australia/Sydney.
         */
        get: operations["listObligations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List audit records, newest first
         * @description Cursor-paginated. Pass `next_cursor` back as `starting_after` for the next page. Filter by `pack`, your own `reference`, or `test`.
         */
        get: operations["listAudit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/audit/{request_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get the stored audit record for a past call */
        get: operations["getAudit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Billable usage for a month */
        get: operations["getUsage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List API keys */
        get: operations["listKeys"];
        put?: never;
        /**
         * Create an API key
         * @description A secret key (the default) is returned once and cannot be retrieved again. Set `kind` to `publishable` for a key that is safe to put in a browser widget: it needs `allowed_origins`, can only hold `assess`, `read` and named `pack:<id>` scopes, can only run assessments and read pack details, and has a rate limit and a monthly cap (defaults 30 per minute; 500 test or 5,000 live calls a month). A key can only grant scopes it holds itself.
         */
        post: operations["createKey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/keys/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Change a key's settings
         * @description Change the name, allowed origins, monthly cap or rate limit of an active key. Scopes, mode and kind cannot change: create a new key for that. A publishable key must keep a monthly cap.
         */
        patch: operations["updateKey"];
        trace?: never;
    };
    "/v1/keys/{id}/rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rotate a key
         * @description Creates a replacement with the same scopes and mode and revokes the old key immediately.
         */
        post: operations["rotateKey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/keys/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke a key */
        post: operations["revokeKey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List webhook endpoints */
        get: operations["listWebhooks"];
        put?: never;
        /**
         * Register a webhook endpoint
         * @description The signing secret is returned once. URLs must be https and publicly reachable. Deliveries are signed (see the `webhooks` section) and retried with backoff.
         */
        post: operations["createWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete a webhook endpoint
         * @description Pending deliveries to it are cancelled.
         */
        delete: operations["deleteWebhook"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}/deliveries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Delivery log for a webhook (latest 50) */
        get: operations["listWebhookDeliveries"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface webhooks {
    "assessment.completed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * An assessment completed
         * @description Sent to your endpoint. Verify the `Briesa-Signature` header (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with your endpoint secret) and reject timestamps older than 5 minutes. Respond 2xx within 10 seconds; anything else is retried after 1 min, 5 min, 30 min, 2 h and 12 h (6 attempts in total). Redirects are not followed. Events never contain raw assessment inputs.
         */
        post: operations["assessment.completed"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "rules.updated": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rules in a pack changed
         * @description Sent to your endpoint. Verify the `Briesa-Signature` header (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with your endpoint secret) and reject timestamps older than 5 minutes. Respond 2xx within 10 seconds; anything else is retried after 1 min, 5 min, 30 min, 2 h and 12 h (6 attempts in total). Redirects are not followed. Events never contain raw assessment inputs.
         */
        post: operations["rules.updated"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "pack.updated": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A pack was added, removed or its version/status changed
         * @description Sent to your endpoint. Verify the `Briesa-Signature` header (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with your endpoint secret) and reject timestamps older than 5 minutes. Respond 2xx within 10 seconds; anything else is retried after 1 min, 5 min, 30 min, 2 h and 12 h (6 attempts in total). Redirects are not followed. Events never contain raw assessment inputs.
         */
        post: operations["pack.updated"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface components {
    schemas: {
        ErrorResponse: {
            error: {
                /** @enum {unknown} */
                type: "invalid_request_error" | "authentication_error" | "permission_error" | "not_found_error" | "idempotency_error" | "rate_limit_error" | "api_error";
                code: string;
                message: string;
                request_id: string;
            };
        };
        Source: {
            instrument: string;
            section?: string;
            url?: string;
            retrieved?: string;
        };
        Pack: {
            id: string;
            name: string;
            industry: string;
            regulators: string[];
            jurisdictions: string[];
            version: string;
            /** @enum {unknown} */
            status: "draft" | "beta" | "verified";
            reviewer: {
                name?: string;
                verified_on?: string;
                source_version?: string;
            } | null;
            licence_tier: string;
        };
        PackDetail: components["schemas"]["Pack"] & {
            scenario_types: {
                [key: string]: {
                    description: string;
                    /** @description Lowest to highest */
                    outcomes: string[];
                    /** @description JSON Schema for `inputs` */
                    input_schema: Record<string, never>;
                };
            };
        };
        AssessResponse: {
            /** @description One of the pack's outcomes for this scenario type */
            outcome: string;
            required_actions: {
                id?: string;
                description?: string;
                rule_id?: string;
            }[];
            missing_information: {
                path?: string;
                description?: string;
                rule_id?: string;
            }[];
            escalation_recommended: boolean;
            reasons: {
                rule_id?: string;
                rule_version?: string;
                title?: string;
                explanation?: string;
                outcome?: string | null;
                source?: components["schemas"]["Source"] | null;
                effective_from?: string;
                effective_to?: string | null;
            }[];
            /** @description Rules marked needs_review that matched. They are NOT applied to the outcome. */
            rules_pending_review: {
                rule_id?: string;
                rule_version?: string;
                title?: string;
            }[];
            ai_assisted_notes: {
                label?: string;
                model?: string;
                notes?: string[];
                edge_cases?: string[];
                questions?: string[];
            } | null;
            /** @enum {unknown} */
            ai_status: "not_requested" | "ok" | "unavailable" | "timeout" | "error" | "invalid_output";
            pack: {
                id?: string;
                version?: string;
                /** @enum {unknown} */
                status?: "draft" | "beta" | "verified";
            };
            /** @description The date (YYYY-MM-DD) the rules were evaluated for */
            as_of: string;
            /** @description Echo of the reference you sent */
            reference: string | null;
            disclaimer: string;
            human_review_recommended: boolean;
            test_mode: boolean;
            request_id: string;
        };
        PackRule: {
            id: string;
            version: string;
            title: string;
            description: string;
            scenario_types?: string[];
            jurisdictions: ("AU" | "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA")[];
            when: components["schemas"]["Rule___schema0"];
            then: {
                outcome?: string;
                required_actions?: {
                    id: string;
                    description: string;
                }[];
                missing_information?: {
                    path: string;
                    description: string;
                }[];
                escalate?: boolean;
                reason?: string;
            };
            source?: {
                instrument: string;
                section?: string;
                /** Format: uri */
                url?: string;
                retrieved?: string;
            };
            effective_from: string;
            effective_from_by_jurisdiction?: {
                [key: string]: string;
            };
            effective_to?: string | null;
            /** @enum {string} */
            status: "active" | "needs_review" | "retired";
        } & {
            pack?: string;
        };
        PackObligation: {
            id: string;
            title: string;
            description: string;
            applies_to: string[];
            jurisdictions: ("AU" | "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA")[];
            deadline?: string;
            source?: {
                instrument: string;
                section?: string;
                /** Format: uri */
                url?: string;
                retrieved?: string;
            };
            effective_from: string;
            effective_from_by_jurisdiction?: {
                [key: string]: string;
            };
            effective_to?: string | null;
            /** @enum {string} */
            status: "active" | "needs_review" | "retired";
        } & {
            pack?: string;
            pack_status?: string;
        };
        AuditRecord: {
            request_id: string;
            endpoint: string;
            pack: {
                id?: string;
                version?: string;
            } | null;
            rule_versions: {
                [key: string]: string;
            } | null;
            /** @description SHA-256 of the canonical JSON inputs. Raw inputs are never stored. */
            inputs_hash: string;
            reference: string | null;
            output: unknown;
            model: string | null;
            test: boolean;
            /** Format: date-time */
            created_at: string;
        };
        UsageRow: {
            packId: string | null;
            endpoint: string;
            test: boolean;
            count: number;
        };
        ApiKey: {
            id: string;
            name: string;
            prefix: string;
            /** @enum {unknown} */
            mode: "test" | "live";
            scopes: string[];
            rate_limit_per_minute: number;
            /** Format: date-time */
            created_at: string;
            revoked_at: string | null;
            rotated_from: string | null;
            /** @enum {unknown} */
            kind: "secret" | "publishable";
            /** @description Publishable keys only */
            allowed_origins: string[];
            /** @description Most billable calls per calendar month, or null */
            monthly_cap: number | null;
            /** @description The full key, for publishable keys only (they are public by design) */
            public_key: string | null;
        };
        ApiKeyCreated: components["schemas"]["ApiKey"] & {
            /** @description Shown once */
            key: string;
        };
        Webhook: {
            id: string;
            url: string;
            events: ("assessment.completed" | "rules.updated" | "pack.updated")[];
            packs: string[];
            /** Format: date-time */
            created_at: string;
        };
        WebhookCreated: components["schemas"]["Webhook"] & {
            /** @description Signing secret, shown once */
            secret: string;
        };
        WebhookDelivery: {
            id: string;
            event: string;
            /** @enum {unknown} */
            status: "pending" | "succeeded" | "failed";
            attempts: number;
            last_status_code: number | null;
            last_error: string | null;
            next_attempt_at: string | null;
            /** Format: date-time */
            created_at: string;
            delivered_at: string | null;
        };
        Rule___schema0: {
            all: components["schemas"]["Rule___schema0"][];
        } | {
            any: components["schemas"]["Rule___schema0"][];
        } | {
            not: components["schemas"]["Rule___schema0"];
        } | {
            path: string;
            /** @enum {string} */
            op: "eq" | "neq" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte" | "exists" | "missing" | "contains";
            value?: unknown;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
        };
    };
    getOpenApi: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": Record<string, never>;
                };
            };
        };
    };
    listPacks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        packs: components["schemas"]["Pack"][];
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getPack: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Pack id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackDetail"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    assess: {
        parameters: {
            query?: never;
            header?: {
                /** @description Repeating a request with the same key and body returns the original response (header `Idempotent-Replayed: true`). Keys are per tenant. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    pack: string;
                    scenario_type: string;
                    /** @enum {string} */
                    jurisdiction: "AU" | "ACT" | "NSW" | "NT" | "QLD" | "SA" | "TAS" | "VIC" | "WA";
                    inputs: {
                        [key: string]: unknown;
                    };
                    as_of?: string;
                    reference?: string;
                    options?: {
                        ai_notes?: boolean;
                    };
                };
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssessResponse"];
                };
            };
            /** @description Invalid request (type `invalid_request_error`) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Idempotency-Key reused with a different request (`idempotency_key_reused`) or its first request is still running (`request_in_progress`, retry shortly) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    listRules: {
        parameters: {
            query?: {
                /** @description Limit to one pack */
                pack?: string;
                /** @description active, needs_review or retired */
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        rules: components["schemas"]["PackRule"][];
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getRule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Rule id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        versions: components["schemas"]["PackRule"][];
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    listObligations: {
        parameters: {
            query?: {
                /** @description Limit to one pack */
                pack?: string;
                /** @description Entity type or activity tag, e.g. pcbu */
                activity?: string;
                /** @description ACT, NSW, NT, QLD, SA, TAS, VIC or WA */
                jurisdiction?: string;
                /** @description YYYY-MM-DD */
                as_of?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        as_of: string;
                        obligations: components["schemas"]["PackObligation"][];
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    listAudit: {
        parameters: {
            query?: {
                /** @description 1 to 100, default 25 */
                limit?: number;
                /** @description Cursor from a previous page */
                starting_after?: string;
                /** @description Pack id */
                pack?: string;
                /** @description Exact match on the reference you sent to /v1/assess */
                reference?: string;
                /** @description true or false */
                test?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["AuditRecord"][];
                        has_more: boolean;
                        next_cursor: string | null;
                    };
                };
            };
            /** @description Invalid request (type `invalid_request_error`) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getAudit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description The request_id returned by the original call */
                request_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuditRecord"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getUsage: {
        parameters: {
            query?: {
                /** @description YYYY-MM, defaults to the current month */
                month?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        month: string;
                        usage: components["schemas"]["UsageRow"][];
                    };
                };
            };
            /** @description Invalid request (type `invalid_request_error`) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    listKeys: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        keys: components["schemas"]["ApiKey"][];
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    createKey: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {string} */
                    mode: "test" | "live";
                    scopes: string[];
                    rate_limit_per_minute?: number;
                    /** @enum {string} */
                    kind?: "secret" | "publishable";
                    allowed_origins?: string[];
                    monthly_cap?: number;
                };
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKeyCreated"];
                };
            };
            /** @description Invalid request (type `invalid_request_error`) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    updateKey: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Key id */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    allowed_origins?: string[];
                    monthly_cap?: number | null;
                    rate_limit_per_minute?: number;
                };
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKey"];
                };
            };
            /** @description Invalid request (type `invalid_request_error`) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    rotateKey: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Key id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKeyCreated"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    revokeKey: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Key id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKey"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    listWebhooks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        webhooks: components["schemas"]["Webhook"][];
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    createWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    url: string;
                    events: ("assessment.completed" | "rules.updated" | "pack.updated")[];
                    packs?: string[];
                };
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookCreated"];
                };
            };
            /** @description Invalid request (type `invalid_request_error`) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    deleteWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Webhook id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        deleted: boolean;
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    listWebhookDeliveries: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Webhook id */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deliveries: components["schemas"]["WebhookDelivery"][];
                    };
                };
            };
            /** @description Missing, invalid or revoked API key */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Live keys need an active subscription (test keys are free); code `subscription_required` */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Key lacks the required scope or pack licence. For browser use: `secret_key_in_browser`, `origin_required`, `origin_not_allowed`, `not_available_to_publishable_keys`, `ai_notes_not_available` */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not found. Packs you are not licensed for also return 404. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Rate limit exceeded (`rate_limited`, see Retry-After) or the key's monthly cap is reached (`monthly_cap_reached`) */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    "assessment.completed": {
        parameters: {
            query?: never;
            header: {
                "Briesa-Signature": string;
                "Briesa-Event": string;
                "Briesa-Delivery": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string;
                    /** @constant */
                    type: "assessment.completed";
                    /** @description Unix seconds */
                    created: number;
                    livemode: boolean;
                    data: {
                        request_id?: string;
                        pack?: {
                            id?: string;
                            version?: string;
                            status?: string;
                        };
                        scenario_type?: string;
                        jurisdiction?: string;
                        outcome?: string;
                        escalation_recommended?: boolean;
                        human_review_recommended?: boolean;
                    };
                };
            };
        };
        responses: {
            /** @description Acknowledged */
            "2XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    "rules.updated": {
        parameters: {
            query?: never;
            header: {
                "Briesa-Signature": string;
                "Briesa-Event": string;
                "Briesa-Delivery": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string;
                    /** @constant */
                    type: "rules.updated";
                    /** @description Unix seconds */
                    created: number;
                    livemode: boolean;
                    data: {
                        pack?: string;
                        version?: string | null;
                        rules?: {
                            added: string[];
                            changed: string[];
                            removed: string[];
                        };
                    };
                };
            };
        };
        responses: {
            /** @description Acknowledged */
            "2XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    "pack.updated": {
        parameters: {
            query?: never;
            header: {
                "Briesa-Signature": string;
                "Briesa-Event": string;
                "Briesa-Delivery": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string;
                    /** @constant */
                    type: "pack.updated";
                    /** @description Unix seconds */
                    created: number;
                    livemode: boolean;
                    data: {
                        pack?: string;
                        /** @enum {unknown} */
                        change?: "added" | "removed" | "updated";
                        from?: Record<string, never> | null;
                        to?: Record<string, never> | null;
                    };
                };
            };
        };
        responses: {
            /** @description Acknowledged */
            "2XX": {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}

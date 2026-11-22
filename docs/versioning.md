# Versioning and deprecation policy

This is the policy the API commits to. There is no production deployment yet, so nothing has been deprecated.

## API version
- The version is in the URL: `/v1/...`. The OpenAPI document's `info.version` is the API's semantic version.
- **Non-breaking changes ship in `/v1` without notice**: new endpoints, new optional request fields, new response fields, new enum values in responses, new packs, new scenario types, new webhook event types. Clients must ignore unknown response fields and handle unknown enum values.
- **Breaking changes require `/v2`**: removing or renaming a field or endpoint, making an optional field required, changing a field's meaning or type, or tightening validation of something previously accepted.

## Deprecation
1. A deprecated endpoint or field is announced in the changelog and marked `deprecated: true` in the OpenAPI document.
2. Responses from a deprecated endpoint add `Deprecation` and `Sunset` headers (RFC 9745 and RFC 8594) naming the removal date.
3. **Minimum notice before removal: 12 months** from the announcement. Security fixes may be faster, with direct notice to affected tenants.
4. The deprecated behaviour keeps working, unchanged, until the sunset date.

## Packs are versioned separately
Compliance content changes when the law changes, so packs have their own versions (semver) and statuses (`draft`, `beta`, `verified`) independent of the API version.
- Every response names the pack `id`, `version` and `status`, and every reason names the `rule_id` and `rule_version`.
- Rules are never edited in place: a changed rule gets a new version with new effective dates, so past assessments remain reproducible from their audit records.
- Subscribe to `pack.updated` and `rules.updated` webhooks to learn about changes. A pack's outputs may legitimately change between versions; that is not an API breaking change.
- A pack moving from `verified` to a lower status, or being removed, is announced through `pack.updated`.

## Test vs live
Test keys use the same logic and versions as live keys.

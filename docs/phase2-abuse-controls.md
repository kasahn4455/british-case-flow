# Phase 2 — Public intake abuse controls

Status: **tested protection layer only — public Phase 1 form remains disconnected**.

This layer protects the future `/api/intake/:publishedFormId` transport without changing the frozen v5.2 legal/factual intake schema or routing rules.

## Request order

1. Require JSON and enforce the existing 32 KiB body limit.
2. Read the trusted Cloudflare `CF-Connecting-IP` header. There is no `X-Forwarded-For` fallback.
3. Reuse or issue an opaque `intake_session` HttpOnly/Secure/SameSite=Lax cookie.
4. HMAC-SHA256 the IP and session identifiers with `INTAKE_ABUSE_PEPPER`; raw identifiers are not sent to Postgres.
5. Execute the durable per-form IP/session rate-limit RPC.
6. Verify the `x-turnstile-token` server-side with Cloudflare Siteverify, including expected action/hostname when configured.
7. Only after those transport checks pass does the existing v5.2 structural/semantic/routing pipeline run.
8. Atomic persistence suppresses identical retry/double-click submissions during a ten-minute window.

## Environment

Server-only:

- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_EXPECTED_ACTION` (recommended: `intake-submit`)
- `TURNSTILE_EXPECTED_HOSTNAME` (recommended in production)
- `INTAKE_ABUSE_PEPPER` (minimum 32 characters; use high entropy)
- existing `SUPABASE_URL`
- existing `SUPABASE_SECRET_KEY`

Browser-safe but **not wired into Phase 1 yet**:

- `VITE_TURNSTILE_SITE_KEY`

If the trusted client-IP header, pepper, Turnstile secret or database configuration is unavailable, the API fails closed with a generic temporary-unavailability response rather than silently bypassing protection.

## Durable rate limiting

The migration adds firm-configurable defaults to `firm_configurations`:

- `rate_limit_window_seconds = 600`
- `rate_limit_ip_max = 30`
- `rate_limit_session_max = 12`
- `critical_volume_security_window_seconds = 3600`
- `critical_volume_security_threshold = 20`

`intake_rate_limit_windows` stores only HMAC pseudonyms. Neither `anon` nor ordinary authenticated staff can read it directly.

`check_intake_rate_limits_v1(...)` is service-role only, resolves the active published form/configuration itself, atomically increments both IP and session windows, returns an explicit retry interval, and records a deduplicated `RATE_LIMIT_TRIGGERED` security event when a transport limit is exceeded.

The defaults are operational starting points, not legal rules; a firm can change them in a versioned configuration before production approval.

## Duplicate suppression

`persist_intake_submission_v52(...)` now takes a transaction-scoped Postgres advisory lock derived from the form ID + SHA-256 submission hash. If an identical submission was already accepted for the same published form during the previous ten minutes, the function returns the existing enquiry ID/reference and creates no second enquiry, routing row, audit row or outbox pair.

This is retry/double-click idempotency. It does not compare legal merits or try to identify whether two different enquiries belong to the same person.

## High-volume CRITICAL behavior

A firm-wide CRITICAL surge never blocks, delays, downgrades or drops a valid enquiry. After each accepted CRITICAL enquiry, persistence counts recent CRITICAL rows in the configured security window. When the configured threshold is crossed, it upserts a separate `HIGH_VOLUME_CRITICAL` row in `security_events`.

`security_events` is visible only to AAL2 managers/admins through RLS. Delivery/notification of security events remains a later worker concern; this phase records the alert condition durably without changing enquiry acceptance.

## Deployment constraint

`CF-Connecting-IP` is trusted only when the production origin is actually reached through Cloudflare. Production infrastructure must prevent bypassing the Cloudflare proxy/origin protection; application code cannot make a directly exposed origin header trustworthy.

## Still not production-complete

- The Phase 1 public form does not render Turnstile or POST to the API yet.
- Real Cloudflare Turnstile keys/hostname are not configured.
- Real Supabase project/secrets are not configured in this repository.
- Security-event delivery/notification worker is not implemented.
- Old rate-limit windows need a scheduled cleanup/retention job before long-term production use.
- CAPTCHA UX and accessibility must be manually tested in the deployed form.

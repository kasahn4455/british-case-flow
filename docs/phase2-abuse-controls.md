# Phase 2 — Public intake abuse controls

Status: **implemented and wired to the fictional demo form; deployment secrets and production approval are still required**.

The public intake page now renders Cloudflare Turnstile and POSTs to `/api/intake/:publishedFormId`. The server remains authoritative for validation, routing, rate limiting and persistence. The frozen v5.2 legal/factual intake schema is unchanged.

## Request order

1. Require JSON and enforce the 32 KiB body limit.
2. Read the trusted Cloudflare `CF-Connecting-IP` header. There is no `X-Forwarded-For` fallback.
3. Reuse or issue an opaque `intake_session` HttpOnly/Secure/SameSite=Lax cookie.
4. HMAC-SHA256 the IP and session identifiers with `INTAKE_ABUSE_PEPPER`; raw identifiers are not sent to Postgres.
5. Verify the `x-turnstile-token` server-side with Cloudflare Siteverify, including expected action/hostname when configured.
6. Only a challenge-verified request consumes the durable per-form IP/session submission quota.
7. Run the authoritative v5.2 structural, semantic and routing pipeline.
8. Persist atomically. Identical retry/double-click submissions are suppressed during the configured duplicate window.

## Environment readiness

Server-only:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_EXPECTED_ACTION` (current UI action: `intake-submit`)
- `TURNSTILE_EXPECTED_HOSTNAME` (recommended in production)
- `INTAKE_ABUSE_PEPPER` (minimum 32 characters; use high entropy)

Browser-safe and now actively used by the intake form:

- `VITE_TURNSTILE_SITE_KEY`

Real values are intentionally absent from GitHub. If the trusted client-IP header, pepper, Turnstile configuration or Supabase backend configuration is unavailable, the API fails closed with a generic temporary-unavailability response.

## Durable rate limiting

The migration adds firm-configurable defaults to `firm_configurations`:

- `rate_limit_window_seconds = 600`
- `rate_limit_ip_max = 30`
- `rate_limit_session_max = 12`
- `critical_volume_security_window_seconds = 3600`
- `critical_volume_security_threshold = 20`

`intake_rate_limit_windows` stores only HMAC pseudonyms. Neither `anon` nor ordinary authenticated staff can read it directly.

`check_intake_rate_limits_v1(...)` is service-role only, resolves the active published form/configuration itself, atomically increments both IP and session windows, returns a retry interval, and records a deduplicated `RATE_LIMIT_TRIGGERED` security event when a transport limit is exceeded.

## Duplicate suppression

`persist_intake_submission_v52(...)` takes a transaction-scoped Postgres advisory lock derived from the form ID + SHA-256 submission hash. If an identical submission was already accepted for the same published form during the duplicate window, it returns the existing enquiry ID/reference and creates no second enquiry, routing row, audit row or outbox pair.

This is retry/double-click idempotency. It does not compare legal merits or attempt to identify whether two different enquiries belong to the same person.

## High-volume CRITICAL behavior

A firm-wide CRITICAL surge never blocks, delays, downgrades or drops a valid enquiry. After each accepted CRITICAL enquiry, persistence counts recent CRITICAL rows in the configured security window. When the configured threshold is crossed, it upserts a separate `HIGH_VOLUME_CRITICAL` row in `security_events`.

`security_events` is visible only to AAL2 managers/admins through RLS. Delivery/notification of security events remains a later worker concern; recording the event does not change enquiry acceptance.

## CSRF boundary

The public intake endpoint is an anonymous custom server route. Its abuse boundary is Turnstile + durable rate limiting + SameSite anonymous session bookkeeping; it does not depend on the staff CSRF middleware.

Authenticated staff mutations must use TanStack `createServerFn` so the globally configured same-origin CSRF middleware applies, or explicitly attach route-local CSRF middleware to any custom mutating route.

## Deployment constraint

`CF-Connecting-IP` is trusted only when the production origin is actually reached through Cloudflare. Production infrastructure must prevent direct-origin bypass; application code cannot make a spoofed origin header trustworthy.

## Still not production-complete

- Real deployment environment secrets are not stored in this repository and must be configured on the hosting platform.
- Production Turnstile hostname/action settings must be tested against the deployed hostname.
- CAPTCHA UX/accessibility requires manual browser testing.
- Security-event and outbox delivery workers are not implemented yet.
- Old rate-limit windows need scheduled cleanup/retention before long-term production use.
- The current public firm is explicitly fictional/demo-only and must not accept real client data until compliance/deployment gates are signed off.

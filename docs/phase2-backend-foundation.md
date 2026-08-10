# Phase 2 — Backend authority foundation (v5.2)

Status: **real backend foundation implemented and tested; still demo-only and not production-approved**.

The browser is no longer authoritative. The public demo form maps UI values into the canonical v5.2 payload and POSTs to `/api/intake/:publishedFormId`; all validation, derived facts, routing, tenant resolution and persistence remain server/database controlled. No generative AI or LLM is present in this path.

## Architecture

1. Public browser maps visible answers to the canonical v5.2 payload and submits only to `/api/intake/:publishedFormId`.
2. Turnstile is rendered in the browser; the server verifies the token before consuming durable rate-limit quota.
3. The server resolves the opaque `publishedFormId` to the active firm/configuration using a server-only Supabase secret key.
4. Stage 1 performs strict structural validation. Unknown properties are rejected, so browser-supplied authority fields such as `firm_id` are never trusted.
5. Stage 2 derives the five v5.2 effective facts from raw answers.
6. Stage 3 enforces derived-dependent requirements and persisted past-date confirmations.
7. Stage 4 evaluates all 15 deterministic routing rules.
8. Stage 5 chooses the highest severity: `CRITICAL > URGENT > PRIORITY > MANUAL_REVIEW > ROUTINE`.
9. One Postgres RPC persists the submission snapshot, enquiry, routing result, audit event and both outbox events atomically.
10. Staff access is Supabase Auth backed and requires an active firm membership plus AAL2 before `/app` is available.
11. Staff mutations must use TanStack server functions (or explicit route-local CSRF middleware); the priority-override broker uses a server function.

## Key server modules

- `src/server/intake-v52/contracts.ts` — canonical v5.2 types and constants.
- `src/server/intake-v52/validation.ts` — Stage 1 structural validation.
- `src/server/intake-v52/semantics.ts` — derived facts + conditional validation.
- `src/server/intake-v52/routing.ts` — condition interpreter + all 15 routing rules.
- `src/server/intake-v52/persistence.ts` — server-only Supabase REST/RPC access and submission hashing.
- `src/server/intake-v52/service.ts` — authoritative processing order.
- `src/server/intake-abuse/**` — Turnstile, pseudonymous identity and durable rate-limit enforcement.
- `src/routes/api.intake.$publishedFormId.ts` — public submission endpoint; never returns internal priority/rules.
- `src/lib/auth/staff-auth.server.ts` — authenticated user, membership and MFA state.
- `src/lib/enquiries/priority-override.functions.ts` — CSRF-protected staff override entry point.
- `src/lib/enquiries/priority-override.server.ts` — server-only service-role RPC broker.

## Database foundation

Base migration: `supabase/migrations/20260810022000_phase2_backend_foundation.sql`

Additional migrations add abuse controls, harden server-only RPC access, and complete the server-brokered priority-override model.

Core tables include:

- `firms`
- `firm_configurations`
- `published_forms`
- `staff_memberships`
- `submission_snapshots`
- `enquiries`
- `routing_results`
- `outbox_events`
- `audit_events`
- `priority_overrides`
- `access_logs`
- `intake_rate_limit_windows`
- `security_events`

### Tenant isolation and staff access

- RLS is enabled on every public table.
- The `anon` role gets no direct enquiry-table access.
- Public intake cannot directly insert into database tables.
- Enquiry access requires active same-firm membership and AAL2.
- Direct authenticated writes to enquiries are intentionally not granted.
- Assigned staff membership is constrained to the same firm as the enquiry.
- The atomic intake RPC re-resolves the active form/configuration and verifies the submitted privacy-notice version/URL.

## Human priority override

Severity rank is:

`CRITICAL=5, URGENT=4, PRIORITY=3, MANUAL_REVIEW=2, ROUTINE=1`

The override path is deliberately server-brokered:

1. Browser calls a TanStack `createServerFn` mutation; same-origin CSRF middleware applies.
2. The server reads the Supabase session with `getUser()`, requires active staff membership, and requires both current and next authenticator assurance levels to be `aal2`.
3. The browser never supplies the actor UUID.
4. The server calls `override_enquiry_priority(...)` with the server-only Supabase secret and the verified actor UUID.
5. The service-role-only RPC independently checks that the actor still has active membership for the enquiry's firm and enforces role rules.
6. Any active authorised staff member may increase priority. Decreases require `senior`, `manager`, or `admin`.
7. Every override records reason, actor, previous priority, new priority and timestamp and creates an audit event.

This model intentionally does **not** depend on `auth.uid()` or `auth.jwt()` inside a service-role-only RPC. User-session identity is verified at the server-function boundary, while same-firm/role authorization is rechecked in Postgres.

## Atomic submission RPC

`persist_intake_submission_v52(...)` is executable by `service_role` only. With current Supabase API keys, the server uses `SUPABASE_SECRET_KEY` (`sb_secret_...`) through the `apikey` header.

The prospect-facing API response contains only acceptance/reference information and never returns priority, rule IDs, derived facts or tenant IDs.

## Abuse controls

Implemented:

- 32 KiB body limit
- JSON content-type requirement
- strict schema / unexpected-field rejection
- server-side max lengths, formats and urgency exclusivity
- honeypot
- explicit Turnstile browser widget + server Siteverify
- per-form/IP/session durable rate limiting using HMAC pseudonyms
- duplicate retry/double-click suppression using an advisory lock + submission hash
- non-blocking high-volume CRITICAL security-event recording
- generic fail-closed errors

See `docs/phase2-abuse-controls.md` for deployment details.

## Staff workspace state

Authentication and MFA are real. The enquiry list/detail UI is **not** real-data-backed yet: `app.enquiries.index.tsx` and `app.enquiries.$id.tsx` still use `MOCK_ENQUIRIES` and remain explicitly labelled as fictional fixture data. No claim should be made that authenticated staff are currently viewing live enquiries.

Replacing those fixtures with tenant-scoped server reads from `enquiries`/`routing_results` is the next application-layer task.

## Environment

Real values are intentionally absent from GitHub. Required deployment configuration is documented in `.env.example` and includes Supabase browser-safe values, server-only Supabase secret, Turnstile keys/settings and the abuse-control pepper.

## Verification

GitHub Actions runs:

- Node backend/contract tests
- production build and TanStack route generation
- full TypeScript check
- targeted lint including public-form wiring and server-only code
- clean disposable Supabase startup and all migrations
- Postgres function lint
- pgTAP database integration tests

Database tests include the service-role priority-override execution path so a future function cannot silently depend on absent user JWT claims again.

## Current limitations / remaining production gates

- The public tenant/form is still explicitly fictional/demo-only.
- Real deployment secrets must be configured on the hosting platform and manually exercised end-to-end.
- A real staff Auth account must be provisioned and TOTP enrolment/challenge verified in the deployed app.
- The staff enquiry list/detail screens still use `MOCK_ENQUIRIES`; real tenant-scoped reads are the next application task.
- Outbox/security-event delivery workers are not implemented.
- Retention/deletion and old rate-limit-window cleanup jobs are not implemented.
- Production privacy/compliance/security sign-off is still required before accepting real client information.

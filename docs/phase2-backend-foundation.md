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
11. Staff list/detail reads use TanStack server functions, derive the firm from the verified staff session, and additionally scope every enquiry query by that firm ID while database RLS remains authoritative.
12. Staff mutations must use TanStack server functions (or explicit route-local CSRF middleware); the priority-override broker uses a server function.

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
- `src/lib/enquiries/live-enquiries.functions.ts` — AAL2 server-function read boundary for queue/detail.
- `src/lib/enquiries/live-enquiries.server.ts` — explicit firm-scoped Supabase reads under the staff session.
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
- Enquiry and routing-result SELECT requires active same-firm membership and AAL2.
- The application also applies the authenticated staff `firmId` as an explicit filter; browser input never selects the tenant.
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

Authentication and MFA are real. The enquiry list and detail routes are now real-data-backed:

- `/app/enquiries` loads up to the latest 200 tenant-scoped enquiry summaries and exact per-priority counts.
- `/app/enquiries/:reference` loads a single tenant-scoped record by public reference.
- Both reads independently require an AAL2 staff session and derive `firmId` from active membership.
- Postgres RLS separately requires AAL2 + same-firm access, so a foreign reference returns no row even if requested explicitly.
- The detail view shows stored server priority/reason/rule IDs plus prospect-entered contact, conflict and date facts. It does not calculate deadlines.
- Assigned-user display is intentionally generic until a separate staff-profile/name model exists; auth-table identity is not exposed to ordinary staff reads.

The old `MOCK_ENQUIRIES` fixture file may remain for isolated design/test use, but the authenticated enquiry routes and staff components no longer depend on it.

## Environment

Real values are intentionally absent from GitHub. Required deployment configuration is documented in `.env.example` and includes Supabase browser-safe values, server-only Supabase secret, Turnstile keys/settings and the abuse-control pepper.

## Verification

GitHub Actions runs:

- Node backend/contract/dashboard mapping tests
- production build and TanStack route generation
- full TypeScript check
- targeted lint including public form, staff dashboard and server-only code
- clean disposable Supabase startup and all migrations
- Postgres function lint
- pgTAP database integration tests

Database tests include:

- the service-role priority-override execution path so a future function cannot silently depend on absent user JWT claims again;
- AAL2 tenant isolation proving staff can read their own firm's enquiries/routing rows but cannot enumerate another firm's records;
- AAL1 denial for enquiry reads.

## Current limitations / remaining production gates

- The public tenant/form is still explicitly fictional/demo-only.
- Real deployment secrets must be configured on the hosting platform and manually exercised end-to-end.
- A real staff Auth account must be provisioned and TOTP enrolment/challenge verified in the deployed app.
- Staff mutation UI for assignment/status/priority/contact logging is not yet exposed even though the audited priority-override backend exists.
- Outbox/security-event delivery workers are not implemented.
- Retention/deletion and old rate-limit-window cleanup jobs are not implemented.
- Production privacy/compliance/security sign-off is still required before accepting real client information.

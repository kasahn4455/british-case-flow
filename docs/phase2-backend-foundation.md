# Phase 2 — Backend authority foundation (v5.2)

Status: **real backend foundation implemented and tested; still demo-only and not production-approved**.

The browser is not authoritative. The public demo form maps visible answers into the canonical v5.2 payload and POSTs to `/api/intake/:publishedFormId`; validation, derived facts, routing, tenant resolution and persistence remain server/database controlled. No generative AI or LLM is present in this path.

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
10. Staff access is Supabase Auth backed and requires active firm membership plus AAL2 before `/app` is available.
11. Staff queue/detail reads use TanStack server functions, derive the firm from the verified session, explicitly filter by that firm ID, and remain subject to database RLS.
12. Staff mutations use TanStack `createServerFn` boundaries so the app's same-origin CSRF middleware applies before any service-role RPC.
13. Outbox delivery is provider-neutral: a protected worker claims database events, sends them to one configured trusted delivery webhook with an idempotency key, then marks delivered or schedules retry/dead-lettering.

## Key modules

- `src/server/intake-v52/**` — canonical v5.2 validation, derivation, routing and persistence.
- `src/server/intake-abuse/**` — Turnstile, pseudonymous identity and durable rate limiting.
- `src/routes/api.intake.$publishedFormId.ts` — public submission endpoint; never returns internal priority/rules.
- `src/lib/auth/staff-auth.server.ts` — authenticated user, membership and MFA state.
- `src/lib/enquiries/live-enquiries.functions.ts` — AAL2 server-function read boundary for queue/detail.
- `src/lib/enquiries/live-enquiries.server.ts` — explicit firm-scoped Supabase reads under the staff session.
- `src/lib/enquiries/staff-actions.functions.ts` — AAL2 assignment/status/contact mutation boundaries.
- `src/lib/enquiries/staff-actions.server.ts` — server-only service-role brokers for those mutations.
- `src/lib/enquiries/priority-override.functions.ts` — CSRF-protected priority-override entry point.
- `src/lib/enquiries/priority-override.server.ts` — server-only priority-override RPC broker.
- `src/server/outbox-worker/**` — worker auth, claim/complete/fail database client and delivery webhook adapter.
- `src/routes/api.workers.outbox.ts` — protected delivery worker endpoint.
- `src/routes/api.workers.maintenance.ts` — protected operational cleanup endpoint.

## Database foundation

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
- `contact_logs`
- `access_logs`
- `intake_rate_limit_windows`
- `security_events`

### Tenant isolation

- RLS is enabled on every browser-readable public table.
- The `anon` role gets no direct enquiry-table access.
- Public intake cannot directly insert into database tables.
- Enquiry, routing-result and contact-log SELECT requires active same-firm membership and AAL2.
- Application reads additionally apply the authenticated staff `firmId`; browser input never selects the tenant.
- Direct authenticated writes to enquiries/contact logs are not granted.
- Service-role mutation RPCs independently re-check the verified actor against active membership for the enquiry's firm.
- Assigned membership is constrained to the same firm as the enquiry.

## Staff actions

The authenticated enquiry detail page now exposes real mutation controls:

- **Assign to me** — ordinary staff may claim unassigned work; taking over another assignee requires `senior`, `manager` or `admin`.
- **Unassign** — the current assignee may unassign themselves; unassigning another staff member's work requires `senior`, `manager` or `admin`.
- **Change status** — active AAL2 staff may set one of the persisted enquiry status values.
- **Priority override** — any active authorised staff member may increase priority; decreases require `senior`, `manager` or `admin`, and a 10–1000 character reason is mandatory.
- **Log contact** — records channel, inbound/outbound direction, factual outcome, optional notes and contact timestamp.

Every mutation derives the actor UUID from the authenticated server session; the browser cannot supply it. Postgres re-checks same-firm membership and writes an audit event. Contact history is readable only through the same AAL2 + same-firm RLS boundary.

## Human priority override

Severity rank is:

`CRITICAL=5, URGENT=4, PRIORITY=3, MANUAL_REVIEW=2, ROUTINE=1`

The service-role-only override RPC intentionally does **not** depend on `auth.uid()` or `auth.jwt()`. User identity is verified at the server-function boundary and passed explicitly; Postgres independently validates that actor against the enquiry's active firm membership before applying role rules and writing `priority_overrides` + `audit_events`.

## Outbox delivery worker

`outbox_events` remains the durable source of truth. Delivery behavior is now implemented without coupling the application to a specific email/SMS vendor.

- `/api/workers/outbox` requires `Authorization: Bearer <OUTBOX_WORKER_TOKEN>`.
- The endpoint fails before claiming work if the downstream delivery processor is not configured.
- `claim_outbox_events(...)` uses `FOR UPDATE SKIP LOCKED` and dedicated lease owner/expiry columns.
- Expired `PROCESSING` leases become claimable again.
- Every downstream request carries both `Idempotency-Key` and `x-outbox-event-type` headers.
- Success marks the event `DELIVERED` and clears lease metadata.
- Failure schedules exponential retry; after the configured maximum attempts the event is dead-lettered.
- Worker bookkeeping never mutates the business delivery payload.
- The worker does not log event payloads.

The configured delivery webhook can be n8n or another approved processor. That processor is responsible for the final transport (for example email/SMS) and must deduplicate by the supplied idempotency key.

## Operational cleanup

`/api/workers/maintenance` calls a service-role-only cleanup RPC that removes:

- intake rate-limit windows older than 48 hours;
- security-event records older than 90 days.

This deliberately does **not** auto-delete enquiries or audit history. Client-data retention/deletion remains a production compliance decision tied to each firm's approved retention policy; the code does not silently invent that policy.

## Staff workspace state

- `/app/enquiries` loads up to the latest 200 tenant-scoped enquiries plus exact per-priority counts and exact total count.
- `/app/enquiries/:reference` loads one tenant-scoped record by public reference.
- Detail shows stored priority/reason/rule IDs, prospect-entered contact/conflict/date facts and the latest contact history.
- No legal deadline is calculated on the staff screen.
- Assigned-user display remains generic until a separate staff-profile/name model exists; auth-table identity is not exposed to ordinary staff reads.
- `MOCK_ENQUIRIES` may remain for isolated design/test use, but authenticated enquiry routes do not depend on it.

## Environment

Real values are intentionally absent from GitHub. `.env.example` documents:

- browser-safe Supabase project values;
- server-only Supabase secret;
- Turnstile keys/settings;
- intake abuse-control pepper;
- worker bearer token;
- trusted outbox delivery webhook URL and token.

## Verification

GitHub Actions runs:

- Node backend/contract/dashboard/worker tests;
- production build and TanStack route generation;
- full TypeScript check;
- targeted lint covering public form, staff actions and worker code;
- clean disposable Supabase startup and all migrations;
- Postgres function lint;
- pgTAP database integration tests.

Database tests include:

- service-role priority override with no user JWT context;
- AAL2 tenant-isolated enquiry/routing reads and AAL1 denial;
- contact-log AAL2 read/AAL1 denial;
- audited assignment/status/contact mutations through the service-role broker model;
- ordinary-staff assignment takeover denial and senior takeover permission;
- atomic outbox claims, lease ownership, wrong-worker completion denial, retry scheduling and lease cleanup.

## Current production gates

- The current tenant/form is still explicitly fictional/demo-only.
- Real deployment secrets must be configured on the hosting platform and exercised end-to-end.
- A real staff Auth account must be provisioned and TOTP enrolment/challenge verified in the deployed app.
- A real scheduler must invoke the protected outbox and maintenance endpoints on an approved cadence.
- A trusted delivery processor must be configured and tested for the final email/SMS transports.
- Firm-specific client-data retention/deletion rules still require compliance approval before automation.
- Production privacy/compliance/security sign-off is required before accepting real client information.

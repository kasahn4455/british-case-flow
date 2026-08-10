# Phase 2 — Backend authority foundation (v5.2)

Status: **implementation foundation only — not production-ready**.

This phase moves authority out of the browser while preserving the Phase 1 UI unchanged. The implementation follows `Immigration_Intake_Schema_v5.2.json` and deliberately uses deterministic rules only.

## Architecture

1. Public browser posts only to `/api/intake/:publishedFormId`.
2. The TanStack Start server route resolves the opaque `publishedFormId` to the active firm/configuration using a **server-only Supabase secret key**.
3. Stage 1 performs strict structural validation. Unknown properties are rejected, so a browser-supplied `firm_id` is never trusted.
4. Stage 2 derives the five v5.2 effective facts from raw answers.
5. Stage 3 enforces derived-dependent conditional requirements and persisted past-date confirmations.
6. Stage 4 evaluates all 15 deterministic routing rules.
7. Stage 5 chooses the highest severity: `CRITICAL > URGENT > PRIORITY > MANUAL_REVIEW > ROUTINE`.
8. A single Postgres RPC persists the submission snapshot, enquiry, routing result, audit event, internal-alert outbox event and prospect-acknowledgement outbox event in one transaction.
9. n8n/worker remains out of scope in this phase. It will consume the outbox after commit; it will never become the system of record.

No generative AI or LLM is present in this path.

## New server modules

- `src/server/intake-v52/contracts.ts` — canonical v5.2 types and option constants.
- `src/server/intake-v52/validation.ts` — Stage 1 raw structural validation only.
- `src/server/intake-v52/semantics.ts` — Stages 2–3 derived facts and conditional validation.
- `src/server/intake-v52/routing.ts` — condition interpreter + all 15 machine-readable routing rules.
- `src/server/intake-v52/persistence.ts` — server-only Supabase REST/RPC access and SHA-256 submission hashing.
- `src/server/intake-v52/service.ts` — authoritative processing order.
- `src/routes/api.intake.$publishedFormId.ts` — public JSON POST endpoint; never returns internal priority or matched rules.

## Database foundation

Migration: `supabase/migrations/20260810022000_phase2_backend_foundation.sql`

Creates:

- `firms`
- `firm_configurations` (versioned, one active config per firm)
- `published_forms` (opaque public ID -> firm/config)
- `staff_memberships` (tenant membership + staff/senior/manager/admin role)
- `submission_snapshots` (immutable raw snapshot + SHA-256 hash)
- `enquiries`
- `routing_results`
- `outbox_events`
- `audit_events`
- `priority_overrides`
- `access_logs`

### Tenant isolation and staff access

- RLS is enabled on every public table.
- The `anon` role gets no direct table access.
- Public intake cannot directly insert into database tables.
- Enquiry access requires an active firm membership **and** Supabase Auth AAL2 (MFA).
- The membership lookup lives in a private `SECURITY DEFINER` helper, not an exposed schema.
- Direct authenticated writes to enquiries are intentionally not granted.
- Human priority changes go through `override_enquiry_priority(...)` so permission and audit rules cannot be bypassed by UI code.
- Assigned staff membership is constrained to the same firm as the enquiry.
- The atomic RPC verifies the submitted privacy-notice version/URL against the active firm configuration.

### Human override rule

Severity rank is:

`CRITICAL=5, URGENT=4, PRIORITY=3, MANUAL_REVIEW=2, ROUTINE=1`

- Any active authorised staff member at AAL2 may increase priority.
- Decreases require `senior`, `manager`, or `admin` role.
- Every override records reason, actor, previous priority, new priority and timestamp and creates an audit event.

## Atomic submission RPC

`persist_intake_submission_v52(...)` is executable by `service_role` only. With current Supabase API keys, the server uses `SUPABASE_SECRET_KEY` (`sb_secret_...`), which maps to elevated backend access.

The RPC independently resolves the `published_form_id` again and refuses inactive forms or inactive configurations. This is intentional defense in depth: no client or application-layer `firm_id` is accepted as authoritative.

The prospect-facing API response contains only:

```json
{
  "accepted": true,
  "enquiryReference": "IM-..."
}
```

It never returns priority, rule IDs, derived facts or tenant IDs.

## Outbox

Every accepted enquiry creates two outbox rows in the same transaction:

- `ENQUIRY_INTERNAL_ALERT`
- `PROSPECT_ACKNOWLEDGEMENT`

The internal event contains only reference + priority + minimal alert copy. The acknowledgement event stores the exact three approved acknowledgement paragraphs rendered with the firm name. Both have idempotency and retry/dead-letter fields.

## Current abuse protection

Implemented now:

- 32 KiB request body limit
- JSON content-type requirement
- strict schema / unexpected-field rejection
- server-side max lengths, email/phone formats and urgency exclusivity
- honeypot field support
- no-store responses

**Still a production blocker:** durable per-IP/session/published-form rate limiting, adaptive CAPTCHA, duplicate-submission detection and high-volume security alerting. An in-memory Worker rate limiter is intentionally not used because it would give a false sense of protection across distributed instances.

## Environment

Real values are intentionally absent from GitHub.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

Read these only inside per-request server code. Never prefix the secret with `VITE_`.

## Tests

`npm run test:backend` runs Node's built-in test runner against:

- routing precedence and all 15 rules
- all eight declared condition operators
- derived facts
- conditional validation bypass prevention
- confirmed/unconfirmed past dates
- unknown-date handling
- malformed urgency combinations
- client-supplied `firm_id` rejection
- field limits and invalid calendar dates

## Deliberately not done yet

Phase 2 foundation does **not** yet:

- connect the Phase 1 browser form to the API
- create a real Supabase project or insert real firm data
- implement staff sign-in/enrolment UI
- implement MFA enrolment screens
- implement n8n/worker outbox consumption
- implement durable abuse rate limiting/CAPTCHA
- implement retention/deletion automation
- make the product production-ready

Those remain gated behind setup, testing and compliance approval.

# Vercel deployment

This project is deployed as a TanStack Start + Nitro application on Vercel.

## Runtime target

`vite.config.ts` keeps Lovable's single bundled Nitro plugin and overrides only its preset to `vercel`. Do not add a second `nitro()` plugin.

`vercel.json` pins the framework preset to `tanstack-start` so SSR routes, server functions and API routes are deployed as Vercel Functions.

## Required environment variables

Browser-safe:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_TURNSTILE_SITE_KEY`

Server-only:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_EXPECTED_ACTION`
- `TURNSTILE_EXPECTED_HOSTNAME` (production hostname only)
- `INTAKE_ABUSE_PEPPER`
- `OUTBOX_WORKER_TOKEN`
- `OUTBOX_DELIVERY_WEBHOOK_URL`
- `OUTBOX_DELIVERY_WEBHOOK_TOKEN`

Never prefix a secret with `VITE_`.

## Deployment gate

Before production promotion:

1. `npm run test:backend`
2. `npm run build`
3. Verify `.vercel/output/config.json`, `.vercel/output/functions`, and `.vercel/output/static` exist.
4. `npx tsc --noEmit`
5. Phase 2 lint passes.
6. Disposable Supabase migrations/lint/pgTAP pass.
7. Production secrets are configured outside GitHub.
8. Deployed `/`, `/login`, `/app`, public intake, and worker endpoints are smoke-tested.
9. One real staff user completes password + TOTP MFA and reaches the tenant-scoped dashboard.
10. Worker endpoints remain inaccessible without their bearer token.

The current tenant/form is fictional/demo-only until production privacy/compliance approval is complete.

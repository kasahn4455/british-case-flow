import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { TextField } from "@/components/intake/TextField";
import { getStaffAuthState } from "@/lib/auth/staff-auth.functions";
import { getStaffDestination, type StaffDestination } from "@/lib/auth/staff-auth-state";
import { createSupabaseBrowserClient, StaffAuthConfigurationError } from "@/lib/supabase/client";
import { FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: `Staff sign in — ${FIRM.shortName}` },
      {
        name: "description",
        content: "Secure staff sign-in for the immigration enquiry intake workspace.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async () => {
    const state = await getStaffAuthState();
    const destination = getStaffDestination(state);
    if (destination !== "/login") throw redirect({ to: destination });
    return state;
  },
  component: LoginPage,
});

function navigateToStaffDestination(
  destination: StaffDestination,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (destination === "/mfa/setup") return navigate({ to: "/mfa/setup" });
  if (destination === "/mfa/challenge") return navigate({ to: "/mfa/challenge" });
  if (destination === "/app/enquiries") return navigate({ to: "/app/enquiries" });
  return navigate({ to: "/login" });
}

function LoginPage() {
  const initialState = Route.useLoaderData();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const notConfigured = initialState.kind === "not_configured";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-md border border-border bg-card px-6 py-7 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {FIRM.shortName}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-foreground">Staff sign in</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Staff accounts are provisioned by the firm. Multi-factor authentication is required
            before enquiry access.
          </p>

          {notConfigured ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-border bg-surface px-3 py-3 text-sm"
            >
              Staff authentication is not configured in this environment. No credentials will be
              submitted.
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-destructive/40 bg-card px-3 py-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <form
            className="mt-6 space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setSubmitting(true);
              try {
                const supabase = createSupabaseBrowserClient();
                const { error: signInError } = await supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (signInError) {
                  setError("Sign-in failed. Check your work email and password and try again.");
                  return;
                }

                const state = await getStaffAuthState();
                if (state.kind === "no_access") {
                  await supabase.auth.signOut({ scope: "local" });
                  setError("This account is not authorised for this workspace.");
                  return;
                }
                navigateToStaffDestination(getStaffDestination(state), navigate);
              } catch (caught) {
                if (caught instanceof StaffAuthConfigurationError) {
                  setError("Staff authentication is not configured in this environment.");
                } else {
                  console.error(caught);
                  setError("Sign-in is temporarily unavailable. Please try again.");
                }
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <TextField
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
            />
            <div>
              <label htmlFor="password" className="text-sm font-semibold text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={notConfigured || submitting}
                className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={notConfigured || submitting || !email.trim() || !password}
              className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Continue"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{FIRM.regulatoryNote}</p>
      </div>
    </div>
  );
}

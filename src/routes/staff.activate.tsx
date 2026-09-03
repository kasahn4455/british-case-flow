import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getStaffAuthState } from "@/lib/auth/staff-auth.functions";
import { getStaffDestination } from "@/lib/auth/staff-auth-state";
import { FIRM } from "@/lib/mock/firm";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/staff/activate")({
  head: () => ({
    meta: [
      { title: `Activate staff account — ${FIRM.shortName}` },
      {
        name: "description",
        content: "Complete setup for an invited staff account.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffActivationPage,
});

function StaffActivationPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function establishInvitationSession() {
      setError("");

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          if (!cancelled) setError("This invitation link is invalid or has expired.");
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) setError("This invitation link is invalid or has expired.");
        return;
      }

      const state = await getStaffAuthState();
      if (state.kind !== "staff") {
        await supabase.auth.signOut({ scope: "local" });
        if (!cancelled) setError("This staff invitation is no longer authorised.");
        return;
      }

      if (!cancelled) setReady(true);
    }

    establishInvitationSession().catch((caught) => {
      console.error(caught);
      if (!cancelled) setError("Staff activation is temporarily unavailable. Please try again.");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md rounded-md border border-border bg-card px-6 py-7 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {FIRM.shortName}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-foreground">
          Activate staff account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Set a strong password for your invited account. Multi-factor authentication will be
          required immediately afterwards.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {!ready && !error ? (
          <p className="mt-5 text-sm text-muted-foreground">Opening your secure invitation…</p>
        ) : null}

        {ready ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");

              if (password.length < 14) {
                setError("Use a password or passphrase with at least 14 characters.");
                return;
              }
              if (password !== confirmPassword) {
                setError("The two password entries do not match.");
                return;
              }

              setSubmitting(true);
              try {
                const supabase = createSupabaseBrowserClient();
                const { error: updateError } = await supabase.auth.updateUser({ password });
                if (updateError) {
                  setError("Password setup failed. Request a new invitation if this link expired.");
                  return;
                }

                const state = await getStaffAuthState();
                const destination = getStaffDestination(state);
                if (destination === "/mfa/setup") {
                  await navigate({ to: "/mfa/setup", replace: true });
                  return;
                }
                if (destination === "/mfa/challenge") {
                  await navigate({ to: "/mfa/challenge", replace: true });
                  return;
                }
                if (destination === "/app/enquiries") {
                  await navigate({ to: "/app/enquiries", replace: true });
                  return;
                }

                await supabase.auth.signOut({ scope: "local" });
                setError("This account is not authorised for this workspace.");
              } catch (caught) {
                console.error(caught);
                setError("Staff activation is temporarily unavailable. Please try again.");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div>
              <label
                htmlFor="activation-password"
                className="text-sm font-semibold text-foreground"
              >
                New password
              </label>
              <input
                id="activation-password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                required
                disabled={submitting}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
              />
            </div>
            <div>
              <label
                htmlFor="activation-confirm-password"
                className="text-sm font-semibold text-foreground"
              >
                Confirm password
              </label>
              <input
                id="activation-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                required
                disabled={submitting}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !password || !confirmPassword}
              className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Activating account…" : "Set password and continue"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

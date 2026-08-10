import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { getStaffAuthState } from "@/lib/auth/staff-auth.functions";
import { getStaffDestination } from "@/lib/auth/staff-auth-state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/mfa/challenge")({
  head: () => ({
    meta: [
      { title: `Verify MFA — ${FIRM.shortName}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async () => {
    const state = await getStaffAuthState();
    const destination = getStaffDestination(state);
    if (destination === "/login") throw redirect({ to: "/login" });
    if (destination === "/mfa/setup") throw redirect({ to: "/mfa/setup" });
    if (destination === "/app/enquiries") throw redirect({ to: "/app/enquiries" });
    return state;
  },
  component: MfaChallengePage,
});

function MfaChallengePage() {
  const state = Route.useLoaderData();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const factorId = state.kind === "staff" ? state.verifiedTotpFactorIds[0] : undefined;

  async function verifyCode() {
    if (!factorId) {
      navigate({ to: "/mfa/setup" });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        setError("That code was not accepted. Check your authenticator app and try again.");
        return;
      }

      const nextState = await getStaffAuthState();
      if (getStaffDestination(nextState) !== "/app/enquiries") {
        setError("MFA verification completed but the secure staff session could not be confirmed.");
        return;
      }

      navigate({ to: "/app/enquiries" });
    } catch (caught) {
      console.error(caught);
      setError("MFA verification is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md rounded-md border border-border bg-card px-6 py-7 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {FIRM.shortName}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-foreground">
          Verify your authenticator
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enter the current 6-digit code from your authenticator app to open the staff workspace.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6">
          <label htmlFor="mfa-challenge-code" className="text-sm font-semibold text-foreground">
            Authenticator code
          </label>
          <input
            id="mfa-challenge-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm tracking-[0.25em] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        <button
          type="button"
          onClick={verifyCode}
          disabled={busy || code.length !== 6 || !factorId}
          className="mt-5 h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Verifying…" : "Verify and continue"}
        </button>
      </div>
    </div>
  );
}

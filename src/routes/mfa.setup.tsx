import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { getStaffAuthState } from "@/lib/auth/staff-auth.functions";
import { getStaffDestination } from "@/lib/auth/staff-auth-state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/mfa/setup")({
  head: () => ({
    meta: [
      { title: `Set up MFA — ${FIRM.shortName}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async () => {
    const state = await getStaffAuthState();
    const destination = getStaffDestination(state);
    if (destination === "/login") throw redirect({ to: "/login" });
    if (destination === "/mfa/challenge") throw redirect({ to: "/mfa/challenge" });
    if (destination === "/app/enquiries") throw redirect({ to: "/app/enquiries" });
    return state;
  },
  component: MfaSetupPage,
});

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function MfaSetupPage() {
  const navigate = useNavigate();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function beginSetup() {
    setError("");
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: factorData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const verified = (factorData.totp ?? [])[0];
      if (verified) {
        navigate({ to: "/mfa/challenge" });
        return;
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `${FIRM.shortName} staff authenticator`,
      });
      if (enrollError) throw enrollError;

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (caught) {
      console.error(caught);
      setError("Authenticator setup could not be started. Sign in again or contact your administrator.");
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup() {
    if (!enrollment || !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollment.factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        setError("That code was not accepted. Check your authenticator app and try again.");
        return;
      }

      const state = await getStaffAuthState();
      if (getStaffDestination(state) !== "/app/enquiries") {
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
      <div className="w-full max-w-lg rounded-md border border-border bg-card px-6 py-7 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {FIRM.shortName}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-foreground">
          Set up multi-factor authentication
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Staff enquiry access requires an authenticator app. This is mandatory for every staff account.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!enrollment ? (
          <button
            type="button"
            onClick={beginSetup}
            disabled={busy}
            className="mt-6 h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Preparing…" : "Set up authenticator"}
          </button>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-md border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-foreground">1. Scan this QR code</p>
              <img
                src={enrollment.qrCode}
                alt="Authenticator enrollment QR code"
                className="mx-auto mt-4 h-52 w-52 bg-white p-2"
              />
              <p className="mt-4 text-xs text-muted-foreground">
                If you cannot scan it, enter this setup key manually:
              </p>
              <code className="mt-2 block break-all rounded bg-card px-3 py-2 text-xs text-foreground">
                {enrollment.secret}
              </code>
            </div>

            <div>
              <label htmlFor="mfa-setup-code" className="text-sm font-semibold text-foreground">
                2. Enter the 6-digit code
              </label>
              <input
                id="mfa-setup-code"
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
              onClick={verifySetup}
              disabled={busy || code.length !== 6}
              className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

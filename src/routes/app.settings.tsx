import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { DetailField } from "@/components/staff/DetailField";
import { getStaffAuthState } from "@/lib/auth/staff-auth.functions";
import { getFirmSettingsOverview } from "@/lib/enquiries/firm-settings.functions";
import { formatReceived } from "@/lib/enquiries/live-enquiries";
import { processFirmOutboxNow } from "@/lib/enquiries/outbox-admin.functions";
import { AUTOMATED_RULES_STATEMENT, FIRM } from "@/lib/mock/firm";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/app/settings")({
  loader: async () => {
    const [authState, settingsOverview] = await Promise.all([
      getStaffAuthState(),
      getFirmSettingsOverview(),
    ]);
    return { authState, settingsOverview };
  },
  head: () => ({
    meta: [
      { title: `Firm settings — ${FIRM.shortName} intake workspace` },
      {
        name: "description",
        content: "Firm settings and account security for the enquiry intake workspace.",
      },
      { property: "og:title", content: `Firm settings — ${FIRM.shortName}` },
      {
        property: "og:description",
        content: "Firm settings and account security for the enquiry intake workspace.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { authState, settingsOverview } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [delivering, setDelivering] = useState(false);
  const isAdmin = authState.kind === "staff" && authState.role === "admin";
  const publishedForm = settingsOverview.publishedForm;
  const notificationHealth = settingsOverview.notificationHealth;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
          Firm settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Firm configuration is read-only in this phase. Account security and operational delivery
          status are live.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Firm profile
          </h2>
          <dl className="mt-2">
            <DetailField label="Firm name">{FIRM.name}</DetailField>
            <DetailField label="Address">{FIRM.address}</DetailField>
            <DetailField label="Telephone">{FIRM.phone}</DetailField>
            <DetailField label="Enquiries inbox">{FIRM.email}</DetailField>
            <DetailField label="Privacy notice">
              <a href={FIRM.privacyPolicyUrl} className="underline underline-offset-4">
                Privacy Notice (placeholder link)
              </a>
            </DetailField>
          </dl>
        </section>

        <section className="rounded-md border border-border bg-card px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Published intake form
          </h2>
          <dl className="mt-2">
            <DetailField label="Form reference">
              {publishedForm?.id ?? "No published form"}
            </DetailField>
            <DetailField label="Status">{publishedForm?.status ?? "Not available"}</DetailField>
            <DetailField label="Public link">
              {publishedForm ? (
                <a
                  href={`/intake/${encodeURIComponent(publishedForm.id)}`}
                  className="break-all underline underline-offset-4"
                >
                  /intake/{publishedForm.id}
                </a>
              ) : (
                "Not available"
              )}
            </DetailField>
            <DetailField label="Automated rules notice">{AUTOMATED_RULES_STATEMENT}</DetailField>
          </dl>
        </section>

        {isAdmin && notificationHealth ? (
          <section className="rounded-md border border-border bg-card px-5 py-5 lg:col-span-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Notification health
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                New notification events wake the delivery worker automatically. A scheduled retry
                also runs every two minutes. The manual control below is a recovery fallback only.
              </p>

              <dl className="mt-4 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label="Delivery mode">
                  {notificationHealth.deliveryMode === "test"
                    ? "Safe test mode"
                    : notificationHealth.deliveryMode === "live"
                      ? "Live email"
                      : "Not configured"}
                </DetailField>
                <DetailField label="Automatic scheduler">
                  {notificationHealth.schedulerActive ? "Active" : "Inactive"}
                </DetailField>
                <DetailField label="Retry schedule">
                  {notificationHealth.schedulerSchedule ?? "Not scheduled"}
                </DetailField>
                <DetailField label="Last scheduler run">
                  {notificationHealth.schedulerLastRunAt
                    ? `${notificationHealth.schedulerLastStatus ?? "unknown"} · ${formatReceived(notificationHealth.schedulerLastRunAt)}`
                    : "No recorded run"}
                </DetailField>
                <DetailField label="Pending">
                  {notificationHealth.pendingCount.toLocaleString("en-GB")}
                </DetailField>
                <DetailField label="Processing">
                  {notificationHealth.processingCount.toLocaleString("en-GB")}
                </DetailField>
                <DetailField label="Retryable failures">
                  {notificationHealth.failedCount.toLocaleString("en-GB")}
                </DetailField>
                <DetailField label="Dead letters">
                  {notificationHealth.deadLetterCount.toLocaleString("en-GB")}
                </DetailField>
                <DetailField label="Delivered">
                  {notificationHealth.deliveredCount.toLocaleString("en-GB")}
                </DetailField>
                <DetailField label="Last delivered">
                  {notificationHealth.lastDeliveredAt
                    ? formatReceived(notificationHealth.lastDeliveredAt)
                    : "No delivery recorded"}
                </DetailField>
              </dl>

              {notificationHealth.deliveryMode === "test" ? (
                <p className="mt-4 rounded-md border border-border bg-surface px-3 py-3 text-sm text-muted-foreground">
                  Safe test mode is active. Prospect and firm email addresses are not used for
                  delivery.
                </p>
              ) : null}
              {notificationHealth.deadLetterCount > 0 || !notificationHealth.schedulerActive ? (
                <p
                  role="alert"
                  className="mt-4 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
                >
                  Notification delivery needs administrator attention.
                </p>
              ) : null}

              {deliveryMessage ? (
                <p className="mt-4 rounded-md border border-border px-3 py-3 text-sm">
                  {deliveryMessage}
                </p>
              ) : null}
              {deliveryError ? (
                <p
                  role="alert"
                  className="mt-4 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
                >
                  {deliveryError}
                </p>
              ) : null}

              <button
                type="button"
                disabled={delivering}
                className="mt-4 h-11 rounded-md border border-border bg-card px-5 text-sm font-semibold transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                onClick={async () => {
                  setDeliveryMessage("");
                  setDeliveryError("");
                  setDelivering(true);
                  try {
                    const result = await processFirmOutboxNow();
                    const providerDetails = result.failureCodes.length
                      ? ` Provider code${result.failureCodes.length === 1 ? "" : "s"}: ${result.failureCodes.join(", ")}.`
                      : "";
                    setDeliveryMessage(
                      `Claimed ${result.claimed}; delivered ${result.delivered}; failed ${result.failed}.${providerDetails}`,
                    );
                    await router.invalidate();
                  } catch (caught) {
                    console.error(caught);
                    setDeliveryError(
                      "Notification delivery is not configured or is temporarily unavailable.",
                    );
                  } finally {
                    setDelivering(false);
                  }
                }}
              >
                {delivering ? "Running delivery…" : "Run delivery now (fallback)"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-md border border-border bg-card px-5 py-5 lg:col-span-2">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Account security
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Change your staff password while this MFA-verified session is active. You will be
              signed out everywhere after the change and must sign in again with the new password
              and your authenticator code.
            </p>

            {passwordError ? (
              <p
                role="alert"
                className="mt-4 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
              >
                {passwordError}
              </p>
            ) : null}

            <form
              className="mt-5 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setPasswordError("");

                if (password.length < 14) {
                  setPasswordError("Use a password or passphrase with at least 14 characters.");
                  return;
                }
                if (password !== confirmPassword) {
                  setPasswordError("The two password entries do not match.");
                  return;
                }

                setSubmitting(true);
                try {
                  const supabase = createSupabaseBrowserClient();
                  const { data: aal, error: aalError } =
                    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                  if (aalError || aal.currentLevel !== "aal2" || aal.nextLevel !== "aal2") {
                    setPasswordError(
                      "Your MFA-verified session is no longer current. Sign in again and retry.",
                    );
                    return;
                  }

                  const { error: updateError } = await supabase.auth.updateUser({ password });
                  if (updateError) {
                    setPasswordError("Password change failed. Please try again.");
                    return;
                  }

                  await supabase.auth.signOut({ scope: "global" });
                  await navigate({ to: "/login", replace: true });
                } catch (caught) {
                  console.error(caught);
                  setPasswordError("Password change is temporarily unavailable. Please try again.");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <div>
                <label htmlFor="new-password" className="text-sm font-semibold text-foreground">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={14}
                  required
                  disabled={submitting}
                  className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="text-sm font-semibold text-foreground">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={14}
                  required
                  disabled={submitting}
                  className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !password || !confirmPassword}
                className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Changing password…" : "Change password"}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-md border border-dashed border-border bg-surface px-5 py-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Reserved for later phases</h2>
          <ul className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <li>Staff accounts and permissions</li>
            <li>Routing and priority rule configuration</li>
            <li>Acknowledgement templates</li>
            <li>Conflict-check workflow</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

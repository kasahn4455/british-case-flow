import { createFileRoute } from "@tanstack/react-router";
import { DetailField } from "@/components/staff/DetailField";
import { AUTOMATED_RULES_STATEMENT, FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: `Firm settings — ${FIRM.shortName} intake workspace` },
      {
        name: "description",
        content: "Placeholder firm settings screen for the enquiry intake prototype.",
      },
      { property: "og:title", content: `Firm settings — ${FIRM.shortName}` },
      {
        property: "og:description",
        content: "Placeholder firm settings screen for the enquiry intake prototype.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
          Firm settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Placeholder screen. Nothing on this page is editable or saved in this phase.
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
              <a
                href={FIRM.privacyPolicyUrl}
                className="underline underline-offset-4"
              >
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
            <DetailField label="Form reference">demo-form</DetailField>
            <DetailField label="Public link">/intake/demo-form</DetailField>
            <DetailField label="Automated rules notice">{AUTOMATED_RULES_STATEMENT}</DetailField>
          </dl>
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

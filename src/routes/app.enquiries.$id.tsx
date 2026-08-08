import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { DetailField } from "@/components/staff/DetailField";
import { PriorityBadge } from "@/components/staff/PriorityBadge";
import { formatReceived, getMockEnquiry } from "@/lib/mock/enquiries";
import { FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/app/enquiries/$id")({
  loader: ({ params }) => {
    const enquiry = getMockEnquiry(params.id);
    if (!enquiry) throw notFound();
    return { enquiry };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.enquiry.id} — ${FIRM.shortName} intake workspace`
          : "Enquiry unavailable",
      },
      {
        name: "description",
        content: "Fictional enquiry record shown for prototype demonstration purposes only.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  notFoundComponent: EnquiryNotFound,
  component: EnquiryDetail,
});

function EnquiryNotFound() {
  return (
    <div className="rounded-md border border-border bg-card px-6 py-10 text-center">
      <h1 className="font-serif text-xl font-semibold">Enquiry not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No fictional record matches that reference.
      </p>
      <Link
        to="/app/enquiries"
        className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Back to enquiries
      </Link>
    </div>
  );
}

function EnquiryDetail() {
  const { enquiry } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <Link
        to="/app/enquiries"
        className="inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to enquiries
      </Link>

      <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
            {enquiry.id}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Received {formatReceived(enquiry.receivedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PriorityBadge priority={enquiry.priority} />
          <span className="text-xs text-muted-foreground">Fixture value — not calculated</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-md border border-border bg-card px-5 py-4 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Enquiry record
          </h2>
          <dl className="mt-2">
            <DetailField label="Enquiry ID">{enquiry.id}</DetailField>
            <DetailField label="Category">{enquiry.category}</DetailField>
            <DetailField label="Location">{enquiry.location}</DetailField>
            <DetailField label="Prospect-entered dates">
              <ul className="space-y-1">
                {enquiry.statedDates.map((d) => (
                  <li key={d.label}>
                    <span className="text-muted-foreground">{d.label}: </span>
                    {d.value}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Dates as entered by the prospect. No deadline has been calculated or verified.
              </p>
            </DetailField>
            <DetailField label="Contact preference">
              {enquiry.contactPreference.method} · {enquiry.contactPreference.time}
            </DetailField>
            <DetailField label="Status">{enquiry.status}</DetailField>
            <DetailField label="Assigned staff">{enquiry.assignedTo ?? "Unassigned"}</DetailField>
            <DetailField label="Matched rule ID">
              <span className="font-mono text-xs">{enquiry.matchedRuleId}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                (placeholder — no meaning in this prototype)
              </span>
            </DetailField>
          </dl>
        </section>

        <div className="space-y-6">
          <section className="rounded-md border border-border bg-card px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Prospect
            </h2>
            <dl className="mt-2">
              <DetailField label="Name">{enquiry.prospect.name}</DetailField>
              <DetailField label="Email">{enquiry.prospect.email}</DetailField>
              <DetailField label="Phone">{enquiry.prospect.phone}</DetailField>
            </dl>
          </section>

          <section className="rounded-md border border-border bg-card px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Conflict-check information
            </h2>
            <dl className="mt-2">
              <DetailField label="Previous names">{enquiry.conflictCheck.previousNames}</DetailField>
              <DetailField label="Spouse/partner name">{enquiry.conflictCheck.partnerName}</DetailField>
              <DetailField label="Sponsoring employer">
                {enquiry.conflictCheck.sponsoringEmployer}
              </DetailField>
              <DetailField label="Existing representative">
                {enquiry.conflictCheck.existingRepresentative}
              </DetailField>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Information as supplied. Conflict clearance is not performed in this prototype.
            </p>
          </section>

          <section className="rounded-md border border-border bg-card px-5 py-4">
            <p className="text-sm font-medium text-foreground">
              Automated acknowledgement sent ✓
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Fictional record.</p>
          </section>
        </div>
      </div>

      <section
        aria-label="Staff actions"
        className="rounded-md border border-dashed border-border bg-surface px-5 py-4"
      >
        <h2 className="text-sm font-semibold text-foreground">Staff actions</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Reserved for a later phase. No actions are available in this prototype.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Assign", "Change status", "Adjust priority", "Log contact"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="h-10 cursor-not-allowed rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground opacity-70"
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

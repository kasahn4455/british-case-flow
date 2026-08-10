import { createFileRoute } from "@tanstack/react-router";
import { EnquiryTable } from "@/components/staff/EnquiryTable";
import { SummaryCards } from "@/components/staff/SummaryCards";
import { getLiveEnquiryQueue } from "@/lib/enquiries/live-enquiries.functions";
import { FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/app/enquiries/")({
  loader: () => getLiveEnquiryQueue(),
  head: () => ({
    meta: [
      { title: `Enquiries — ${FIRM.shortName} intake workspace` },
      {
        name: "description",
        content: "Authenticated tenant-scoped immigration enquiry queue.",
      },
      { property: "og:title", content: `Enquiries — ${FIRM.shortName} intake workspace` },
      {
        property: "og:description",
        content: "Authenticated tenant-scoped immigration enquiry queue.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EnquiriesDashboard,
});

function EnquiriesDashboard() {
  const { enquiries, counts } = Route.useLoaderData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Enquiries</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Live tenant-scoped records from Supabase. Priority values shown here were persisted by the
          authoritative v5.2 server routing pipeline; nothing on this screen calculates legal
          deadlines or priority in the browser.
        </p>
      </div>

      <SummaryCards counts={counts} />

      <section aria-label="Enquiry queue" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Enquiry queue ({enquiries.length})
        </h2>
        {enquiries.length > 0 ? (
          <EnquiryTable enquiries={enquiries} />
        ) : (
          <div className="rounded-md border border-border bg-card px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No enquiries yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New accepted submissions for this firm will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

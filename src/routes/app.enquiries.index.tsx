import { createFileRoute } from "@tanstack/react-router";
import { EnquiryTable } from "@/components/staff/EnquiryTable";
import { SummaryCards } from "@/components/staff/SummaryCards";
import { MOCK_ENQUIRIES } from "@/lib/mock/enquiries";
import { FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/app/enquiries/")({
  head: () => ({
    meta: [
      { title: `Enquiries — ${FIRM.shortName} intake workspace` },
      {
        name: "description",
        content: "Prototype enquiry queue showing fictional immigration enquiries and their mock priority states.",
      },
      { property: "og:title", content: `Enquiries — ${FIRM.shortName} intake workspace` },
      {
        property: "og:description",
        content: "Prototype enquiry queue showing fictional immigration enquiries and their mock priority states.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EnquiriesDashboard,
});

function EnquiriesDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Enquiries</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Priority values shown here are fictional fixture data for demonstration. Routing and
          priority will be determined by the backend in a later phase — nothing on this screen is
          calculated in the browser.
        </p>
      </div>

      <SummaryCards />

      <section aria-label="Enquiry queue" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Enquiry queue ({MOCK_ENQUIRIES.length})
        </h2>
        <EnquiryTable enquiries={MOCK_ENQUIRIES} />
      </section>
    </div>
  );
}

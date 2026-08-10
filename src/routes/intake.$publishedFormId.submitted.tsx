import { createFileRoute, Link } from "@tanstack/react-router";
import { IntakeShell } from "@/components/intake/IntakeShell";
import { ACKNOWLEDGEMENT_PARAGRAPHS, FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/intake/$publishedFormId/submitted")({
  head: () => ({
    meta: [
      { title: `Enquiry received — ${FIRM.name}` },
      {
        name: "description",
        content:
          "Confirmation that your enquiry has been received by Hamilton Immigration Solicitors. Prototype screen using fictional data.",
      },
      { property: "og:title", content: `Enquiry received — ${FIRM.name}` },
      {
        property: "og:description",
        content: "Confirmation that your enquiry has been received. Prototype screen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SubmittedPage,
});

function SubmittedPage() {
  const { publishedFormId } = Route.useParams();

  return (
    <IntakeShell publishedFormId={publishedFormId}>
      <div className="rounded-md border border-border bg-card px-5 py-7 sm:px-8 sm:py-9">
        <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
          Enquiry received
        </h1>
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-foreground">
          {ACKNOWLEDGEMENT_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="mt-7 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
          <p>
            {FIRM.name} · {FIRM.phone} · {FIRM.email}
          </p>
        </div>
        <Link
          to="/intake/$publishedFormId"
          params={{ publishedFormId }}
          className="mt-6 inline-flex h-11 items-center rounded-md border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Start another enquiry
        </Link>
      </div>
    </IntakeShell>
  );
}

import { Link } from "@tanstack/react-router";
import { formatReceived, type LiveEnquirySummary } from "@/lib/enquiries/live-enquiries";
import { PriorityBadge } from "./PriorityBadge";

export function EnquiryTable({ enquiries }: { enquiries: LiveEnquirySummary[] }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <table className="hidden w-full text-left text-sm md:table">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-semibold">
              Enquiry ID
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Received
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Priority
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Category
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Assigned staff
            </th>
          </tr>
        </thead>
        <tbody>
          {enquiries.map((enquiry) => (
            <tr key={enquiry.id} className="border-b border-border last:border-0 hover:bg-muted/60">
              <td className="px-4 py-3 font-medium">
                <Link
                  to="/app/enquiries/$id"
                  params={{ id: enquiry.id }}
                  className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {enquiry.id}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {formatReceived(enquiry.receivedAt)}
              </td>
              <td className="px-4 py-3">
                <PriorityBadge priority={enquiry.priority} />
              </td>
              <td className="px-4 py-3">{enquiry.category}</td>
              <td className="px-4 py-3 text-muted-foreground">{enquiry.status}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {enquiry.assignedTo ?? "Unassigned"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border md:hidden">
        {enquiries.map((enquiry) => (
          <li key={enquiry.id} className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                to="/app/enquiries/$id"
                params={{ id: enquiry.id }}
                className="text-sm font-semibold underline-offset-4 hover:underline"
              >
                {enquiry.id}
              </Link>
              <PriorityBadge priority={enquiry.priority} />
            </div>
            <p className="mt-2 text-sm text-foreground">{enquiry.category}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline font-medium">Received: </dt>
                <dd className="inline">{formatReceived(enquiry.receivedAt)}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Status: </dt>
                <dd className="inline">{enquiry.status}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Assigned: </dt>
                <dd className="inline">{enquiry.assignedTo ?? "Unassigned"}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

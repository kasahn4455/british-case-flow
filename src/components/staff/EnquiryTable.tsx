import { Link } from "@tanstack/react-router";
import { formatReceived, type MockEnquiry } from "@/lib/mock/enquiries";
import { PriorityBadge } from "./PriorityBadge";

export function EnquiryTable({ enquiries }: { enquiries: MockEnquiry[] }) {
  return (
    <div className="rounded-md border border-border bg-card">
      {/* Desktop table */}
      <table className="hidden w-full text-left text-sm md:table">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-semibold">Enquiry ID</th>
            <th scope="col" className="px-4 py-3 font-semibold">Received</th>
            <th scope="col" className="px-4 py-3 font-semibold">Priority</th>
            <th scope="col" className="px-4 py-3 font-semibold">Category</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            <th scope="col" className="px-4 py-3 font-semibold">Assigned staff</th>
          </tr>
        </thead>
        <tbody>
          {enquiries.map((e) => (
            <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/60">
              <td className="px-4 py-3 font-medium">
                <Link
                  to="/app/enquiries/$id"
                  params={{ id: e.id }}
                  className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {e.id}
                </Link>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatReceived(e.receivedAt)}
              </td>
              <td className="px-4 py-3">
                <PriorityBadge priority={e.priority} />
              </td>
              <td className="px-4 py-3">{e.category}</td>
              <td className="px-4 py-3 text-muted-foreground">{e.status}</td>
              <td className="px-4 py-3 text-muted-foreground">{e.assignedTo ?? "Unassigned"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {enquiries.map((e) => (
          <li key={e.id} className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                to="/app/enquiries/$id"
                params={{ id: e.id }}
                className="text-sm font-semibold underline-offset-4 hover:underline"
              >
                {e.id}
              </Link>
              <PriorityBadge priority={e.priority} />
            </div>
            <p className="mt-2 text-sm text-foreground">{e.category}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div><dt className="inline font-medium">Received: </dt><dd className="inline">{formatReceived(e.receivedAt)}</dd></div>
              <div><dt className="inline font-medium">Status: </dt><dd className="inline">{e.status}</dd></div>
              <div><dt className="inline font-medium">Assigned: </dt><dd className="inline">{e.assignedTo ?? "Unassigned"}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

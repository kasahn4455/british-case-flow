import { PRIORITY_LABELS, type Priority } from "@/lib/mock/enquiries";

const STYLES: Record<Priority, string> = {
  CRITICAL: "bg-critical text-critical-foreground border-critical-foreground/25",
  URGENT: "bg-urgent text-urgent-foreground border-urgent-foreground/25",
  PRIORITY: "bg-priority text-priority-foreground border-priority-foreground/25",
  MANUAL_REVIEW: "bg-review text-review-foreground border-review-foreground/25",
  ROUTINE: "bg-routine text-routine-foreground border-routine-foreground/25",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

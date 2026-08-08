import { countByPriority, PRIORITY_LABELS, PRIORITY_ORDER, type Priority } from "@/lib/mock/enquiries";

const ACCENTS: Record<Priority, string> = {
  CRITICAL: "border-t-critical-foreground/70",
  URGENT: "border-t-urgent-foreground/70",
  PRIORITY: "border-t-priority-foreground/70",
  MANUAL_REVIEW: "border-t-review-foreground/70",
  ROUTINE: "border-t-routine-foreground/60",
};

export function SummaryCards() {
  const counts = countByPriority();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {PRIORITY_ORDER.map((priority) => (
        <div
          key={priority}
          className={`rounded-md border border-border border-t-2 bg-card px-4 py-4 ${ACCENTS[priority]}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {PRIORITY_LABELS[priority]}
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-foreground tabular-nums">
            {counts[priority]}
          </p>
        </div>
      ))}
    </div>
  );
}

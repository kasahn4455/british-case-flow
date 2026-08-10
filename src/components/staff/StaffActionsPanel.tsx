import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { overrideEnquiryPriority } from "@/lib/enquiries/priority-override.functions";
import {
  assignEnquiryToSelf,
  changeEnquiryStatus,
  logEnquiryContact,
  unassignEnquiry,
} from "@/lib/enquiries/staff-actions.functions";
import type { DatabaseEnquiryStatus, Priority } from "@/lib/enquiries/live-enquiries";

const STATUS_OPTIONS: { value: DatabaseEnquiryStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "AWAITING_CLIENT", label: "Awaiting client" },
  { value: "CLOSED", label: "Closed" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "CRITICAL", label: "Critical" },
  { value: "URGENT", label: "Urgent" },
  { value: "PRIORITY", label: "Priority" },
  { value: "MANUAL_REVIEW", label: "Manual review" },
  { value: "ROUTINE", label: "Routine" },
];

type BusyAction = "assign" | "unassign" | "status" | "priority" | "contact" | null;

export function StaffActionsPanel({
  publicReference,
  currentStatus,
  currentPriority,
  isAssigned,
}: {
  publicReference: string;
  currentStatus: DatabaseEnquiryStatus;
  currentPriority: Priority;
  isAssigned: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<DatabaseEnquiryStatus>(currentStatus);
  const [priority, setPriority] = useState<Priority>(currentPriority);
  const [priorityReason, setPriorityReason] = useState("");
  const [channel, setChannel] = useState<"PHONE" | "EMAIL" | "SMS" | "OTHER">("PHONE");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("OUTBOUND");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");

  async function run(
    action: Exclude<BusyAction, null>,
    task: () => Promise<unknown>,
    success: string,
  ): Promise<boolean> {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(success);
      await router.invalidate();
      return true;
    } catch (caught) {
      console.error(caught);
      setError(
        "The action could not be completed. Your access or the enquiry state may have changed.",
      );
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="Staff actions"
      className="rounded-md border border-border bg-card px-5 py-5"
    >
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Staff actions
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        These actions are server-side, MFA-gated and audited. Priority decreases are restricted to
        senior, manager or admin roles.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
          <h3 className="text-sm font-semibold">Assignment</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "assign",
                  () => assignEnquiryToSelf({ data: { publicReference } }),
                  "Enquiry assigned to you.",
                )
              }
              className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy === "assign" ? "Assigning…" : "Assign to me"}
            </button>
            <button
              type="button"
              disabled={busy !== null || !isAssigned}
              onClick={() =>
                void run(
                  "unassign",
                  () => unassignEnquiry({ data: { publicReference } }),
                  "Enquiry unassigned.",
                )
              }
              className="h-10 rounded-md border border-border bg-card px-4 text-sm font-semibold disabled:opacity-60"
            >
              {busy === "unassign" ? "Unassigning…" : "Unassign"}
            </button>
          </div>
        </div>

        <form
          className="space-y-3 rounded-md border border-border bg-surface px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (status === currentStatus) return;
            void run(
              "status",
              () => changeEnquiryStatus({ data: { publicReference, newStatus: status } }),
              "Enquiry status updated.",
            );
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="staff-status">
            Status
          </label>
          <select
            id="staff-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as DatabaseEnquiryStatus)}
            disabled={busy !== null}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy !== null || status === currentStatus}
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "status" ? "Saving…" : "Change status"}
          </button>
        </form>

        <form
          className="space-y-3 rounded-md border border-border bg-surface px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (priority === currentPriority || priorityReason.trim().length < 10) return;
            void (async () => {
              const succeeded = await run(
                "priority",
                () =>
                  overrideEnquiryPriority({
                    data: {
                      publicReference,
                      newPriority: priority,
                      reason: priorityReason.trim(),
                    },
                  }),
                "Priority override recorded.",
              );
              if (succeeded) setPriorityReason("");
            })();
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="staff-priority">
            Priority override
          </label>
          <select
            id="staff-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            disabled={busy !== null}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label
            className="block text-xs font-semibold text-muted-foreground"
            htmlFor="priority-reason"
          >
            Reason (minimum 10 characters)
          </label>
          <textarea
            id="priority-reason"
            value={priorityReason}
            onChange={(event) => setPriorityReason(event.target.value)}
            maxLength={1000}
            rows={3}
            disabled={busy !== null}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={
              busy !== null || priority === currentPriority || priorityReason.trim().length < 10
            }
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "priority" ? "Recording…" : "Apply priority override"}
          </button>
        </form>

        <form
          className="space-y-3 rounded-md border border-border bg-surface px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!outcome.trim()) return;
            void (async () => {
              const succeeded = await run(
                "contact",
                () =>
                  logEnquiryContact({
                    data: {
                      publicReference,
                      channel,
                      direction,
                      outcome: outcome.trim(),
                      ...(notes.trim() ? { notes: notes.trim() } : {}),
                    },
                  }),
                "Contact log recorded.",
              );
              if (succeeded) {
                setOutcome("");
                setNotes("");
              }
            })();
          }}
        >
          <h3 className="text-sm font-semibold">Log contact</h3>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Contact channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value as typeof channel)}
              disabled={busy !== null}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="PHONE">Phone</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="OTHER">Other</option>
            </select>
            <select
              aria-label="Contact direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value as typeof direction)}
              disabled={busy !== null}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="OUTBOUND">Outbound</option>
              <option value="INBOUND">Inbound</option>
            </select>
          </div>
          <input
            aria-label="Contact outcome"
            placeholder="Outcome, e.g. voicemail left"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            maxLength={200}
            disabled={busy !== null}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          />
          <textarea
            aria-label="Contact notes"
            placeholder="Optional factual note"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            rows={3}
            disabled={busy !== null}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy !== null || !outcome.trim()}
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "contact" ? "Recording…" : "Record contact"}
          </button>
        </form>
      </div>
    </section>
  );
}

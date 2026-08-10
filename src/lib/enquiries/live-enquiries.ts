export type Priority = "CRITICAL" | "URGENT" | "PRIORITY" | "MANUAL_REVIEW" | "ROUTINE";
export type DatabaseEnquiryStatus =
  | "NEW"
  | "IN_REVIEW"
  | "CONTACTED"
  | "AWAITING_CLIENT"
  | "CLOSED";
export type PriorityCounts = Record<Priority, number>;

export const PRIORITY_ORDER: Priority[] = [
  "CRITICAL",
  "URGENT",
  "PRIORITY",
  "MANUAL_REVIEW",
  "ROUTINE",
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: "Critical",
  URGENT: "Urgent",
  PRIORITY: "Priority",
  MANUAL_REVIEW: "Manual review",
  ROUTINE: "Routine",
};

const STATUS_LABELS: Record<DatabaseEnquiryStatus, string> = {
  NEW: "New",
  IN_REVIEW: "In review",
  CONTACTED: "Contacted",
  AWAITING_CLIENT: "Awaiting client",
  CLOSED: "Closed",
};

export interface LiveEnquirySummary {
  id: string;
  receivedAt: string;
  priority: Priority;
  category: string;
  status: string;
  assignedTo: string | null;
  location: string;
  contactPreference: { method: string; time: string };
}

export interface LiveEnquiryDetail extends LiveEnquirySummary {
  priorityReason: string;
  matchedRuleIds: string[];
  conflictCheckState: string;
  statedDates: { label: string; value: string }[];
  prospect: { name: string; email: string; phone: string };
  conflictCheck: {
    previousNames: string;
    partnerName: string;
    sponsoringEmployer: string;
    existingRepresentative: string;
  };
}

export type EnquirySummaryRow = {
  public_reference: string;
  submitted_at: string;
  priority: Priority;
  category: string;
  status: DatabaseEnquiryStatus;
  assigned_staff_membership_id: string | null;
  location_status: string;
  preferred_contact_method: string;
  preferred_contact_time: string | null;
};

export type EnquiryDetailRow = EnquirySummaryRow & {
  full_name: string;
  email: string;
  phone: string;
  intake_answers: unknown;
  priority_reason: string;
  matched_rule_ids: string[] | null;
  conflict_check_state: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function suppliedOrFallback(value: string | undefined): string {
  return value ?? "Not provided";
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatReceived(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export function emptyPriorityCounts(): PriorityCounts {
  return {
    CRITICAL: 0,
    URGENT: 0,
    PRIORITY: 0,
    MANUAL_REVIEW: 0,
    ROUTINE: 0,
  };
}

export function mapEnquirySummaryRow(row: EnquirySummaryRow): LiveEnquirySummary {
  return {
    id: row.public_reference,
    receivedAt: row.submitted_at,
    priority: row.priority,
    category: row.category,
    status: STATUS_LABELS[row.status],
    assignedTo: row.assigned_staff_membership_id ? "Assigned staff member" : null,
    location: row.location_status,
    contactPreference: {
      method: row.preferred_contact_method,
      time: row.preferred_contact_time ?? "Not specified",
    },
  };
}

export function extractProspectStatedDates(
  intakeAnswers: unknown,
): { label: string; value: string }[] {
  const answers = asRecord(intakeAnswers);
  const fields = [
    ["Visa/permission expiry", "visa_expiry_date_known", "visa_expiry_date"],
    ["Hearing date", "hearing_date_value_known", "hearing_date_value"],
    ["Removal/deportation date", "removal_date_value_known", "removal_date_value"],
    ["Other stated deadline", "other_deadline_date_known", "other_deadline_date"],
    [
      "Decision response deadline",
      "decision_stated_deadline_date_known",
      "decision_stated_deadline_date",
    ],
  ] as const;

  return fields.flatMap(([label, knownKey, dateKey]) => {
    const known = stringValue(answers, knownKey);
    const date = stringValue(answers, dateKey);
    if (!known && !date) return [];
    return [{ label, value: date ? formatDateOnly(date) : "Not known" }];
  });
}

export function mapEnquiryDetailRow(row: EnquiryDetailRow): LiveEnquiryDetail {
  const answers = asRecord(row.intake_answers);
  return {
    ...mapEnquirySummaryRow(row),
    priorityReason: row.priority_reason,
    matchedRuleIds: row.matched_rule_ids ?? [],
    conflictCheckState: row.conflict_check_state,
    statedDates: extractProspectStatedDates(row.intake_answers),
    prospect: {
      name: row.full_name,
      email: row.email,
      phone: row.phone,
    },
    conflictCheck: {
      previousNames: suppliedOrFallback(stringValue(answers, "previous_names")),
      partnerName: suppliedOrFallback(stringValue(answers, "spouse_partner_name")),
      sponsoringEmployer: suppliedOrFallback(stringValue(answers, "sponsoring_employer")),
      existingRepresentative: suppliedOrFallback(stringValue(answers, "existing_representative")),
    },
  };
}

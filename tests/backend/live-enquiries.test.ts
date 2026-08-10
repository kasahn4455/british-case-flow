import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyPriorityCounts,
  extractProspectStatedDates,
  mapContactLogRow,
  mapEnquiryDetailRow,
  mapEnquirySummaryRow,
  type EnquiryDetailRow,
  type EnquirySummaryRow,
} from "../../src/lib/enquiries/live-enquiries.ts";

const summaryRow: EnquirySummaryRow = {
  public_reference: "IM-TEST-001",
  submitted_at: "2026-08-10T03:00:00.000Z",
  priority: "URGENT",
  category: "I received a refusal or Home Office decision",
  status: "IN_REVIEW",
  assigned_staff_membership_id: null,
  location_status: "Inside the UK",
  preferred_contact_method: "Email",
  preferred_contact_time: null,
};

test("live queue mapper preserves authoritative persisted fields", () => {
  const mapped = mapEnquirySummaryRow(summaryRow);
  assert.equal(mapped.id, "IM-TEST-001");
  assert.equal(mapped.priority, "URGENT");
  assert.equal(mapped.status, "In review");
  assert.equal(mapped.statusCode, "IN_REVIEW");
  assert.equal(mapped.assignedTo, null);
  assert.deepEqual(mapped.contactPreference, { method: "Email", time: "Not specified" });
});

test("priority counts start at zero for every v5.2 severity", () => {
  assert.deepEqual(emptyPriorityCounts(), {
    CRITICAL: 0,
    URGENT: 0,
    PRIORITY: 0,
    MANUAL_REVIEW: 0,
    ROUTINE: 0,
  });
});

test("date display uses only prospect-supplied date fields and never calculates a deadline", () => {
  const dates = extractProspectStatedDates({
    hearing_date_value_known: "Yes, I know the exact date",
    hearing_date_value: "2026-08-19",
    other_deadline_date_known: "No / not sure",
  });

  assert.deepEqual(dates, [
    { label: "Hearing date", value: "19 Aug 2026" },
    { label: "Other stated deadline", value: "Not known" },
  ]);
});

test("detail mapper returns real prospect, conflict and routing fields", () => {
  const row: EnquiryDetailRow = {
    ...summaryRow,
    assigned_staff_membership_id: "50000000-0000-0000-0000-000000000001",
    full_name: "Demo Prospect",
    email: "demo@example.test",
    phone: "+447700900001",
    intake_answers: {
      previous_names: "Previous Name",
      spouse_partner_name: "Partner Name",
      existing_representative: "No",
    },
    priority_reason: "Matched URGENT_DECISION_NO_DEADLINE",
    matched_rule_ids: ["URGENT_DECISION_NO_DEADLINE"],
    conflict_check_state: "CONFLICT_CHECK_PENDING",
  };

  const mapped = mapEnquiryDetailRow(row);
  assert.equal(mapped.assignedTo, "Assigned staff member");
  assert.equal(mapped.prospect.name, "Demo Prospect");
  assert.equal(mapped.conflictCheck.previousNames, "Previous Name");
  assert.equal(mapped.conflictCheck.partnerName, "Partner Name");
  assert.equal(mapped.conflictCheck.sponsoringEmployer, "Not provided");
  assert.equal(mapped.conflictCheck.existingRepresentative, "No");
  assert.deepEqual(mapped.matchedRuleIds, ["URGENT_DECISION_NO_DEADLINE"]);
  assert.equal(mapped.priorityReason, "Matched URGENT_DECISION_NO_DEADLINE");
  assert.deepEqual(mapped.contactHistory, []);
});

test("contact history mapper preserves only persisted contact facts", () => {
  assert.deepEqual(
    mapContactLogRow({
      id: "70000000-0000-0000-0000-000000000001",
      channel: "PHONE",
      direction: "OUTBOUND",
      outcome: "Voicemail left",
      notes: "No legal advice provided.",
      contacted_at: "2026-08-10T10:00:00.000Z",
    }),
    {
      id: "70000000-0000-0000-0000-000000000001",
      channel: "PHONE",
      direction: "OUTBOUND",
      outcome: "Voicemail left",
      notes: "No legal advice provided.",
      contactedAt: "2026-08-10T10:00:00.000Z",
    },
  );
});

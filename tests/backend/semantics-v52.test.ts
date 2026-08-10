import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalIntakeSubmission } from "../../src/server/intake-v52/contracts.ts";
import {
  conditionalValidateSubmission,
  deriveFacts,
} from "../../src/server/intake-v52/semantics.ts";

const NOW = new Date("2026-08-10T12:00:00Z");

function baseSubmission(
  overrides: Partial<CanonicalIntakeSubmission> = {},
): CanonicalIntakeSubmission {
  return {
    full_name: "Demo Person",
    email: "demo@example.test",
    phone: "+442079460812",
    preferred_contact_method: "Email",
    category: "Making a new application",
    location_status: "Inside the UK",
    urgency_flags: ["none"],
    past_date_confirmations: {},
    existing_representative: "No",
    privacy_notice_version: "demo-v1",
    privacy_notice_url: "https://example.test/privacy",
    privacy_notice_displayed_at: "2026-08-10T12:00:00+01:00",
    ...overrides,
  };
}

test("derived decision fact resolves category or urgency paths", () => {
  assert.equal(
    deriveFacts(baseSubmission({ category: "I received a refusal or Home Office decision" }))
      .effective_decision_received,
    true,
  );
  assert.equal(
    deriveFacts(baseSubmission({ urgency_flags: ["decision_received"] }))
      .effective_decision_received,
    true,
  );
});

test("derived detention and removal facts resolve duplicate form paths", () => {
  assert.equal(deriveFacts(baseSubmission({ currently_detained: "Yes" })).effective_detained, true);
  assert.equal(
    deriveFacts(baseSubmission({ urgency_flags: ["detained"] })).effective_detained,
    true,
  );
  assert.equal(
    deriveFacts(baseSubmission({ removal_date_given: "Yes" })).effective_removal_date,
    true,
  );
  assert.equal(
    deriveFacts(baseSubmission({ urgency_flags: ["removal_date"] })).effective_removal_date,
    true,
  );
});

test("detention category unresolved fact covers Not sure and both-No state", () => {
  assert.equal(
    deriveFacts(
      baseSubmission({
        category: "Detention / removal enquiry",
        currently_detained: "Not sure",
        removal_date_given: "No",
      }),
    ).detention_category_unresolved,
    true,
  );
  assert.equal(
    deriveFacts(
      baseSubmission({
        category: "Detention / removal enquiry",
        currently_detained: "No",
        removal_date_given: "No",
      }),
    ).detention_category_unresolved,
    true,
  );
});

test("location uncertainty derives from Not sure / other", () => {
  assert.equal(
    deriveFacts(baseSubmission({ location_status: "Not sure / other" })).location_uncertain,
    true,
  );
});

test("decision deadline status cannot be bypassed when derived decision fact is true", () => {
  const input = baseSubmission({ urgency_flags: ["decision_received"] });
  const issues = conditionalValidateSubmission(input, deriveFacts(input), NOW);
  assert(issues.some((item) => item.code === "DECISION_DEADLINE_STATUS_REQUIRED"));
});

test("removal date known gate cannot be bypassed through either raw path", () => {
  const categoryPath = baseSubmission({
    category: "Detention / removal enquiry",
    currently_detained: "No",
    removal_date_given: "Yes",
  });
  const urgencyPath = baseSubmission({ urgency_flags: ["removal_date"] });

  assert(
    conditionalValidateSubmission(categoryPath, deriveFacts(categoryPath), NOW).some(
      (item) => item.field === "removal_date_value_known",
    ),
  );
  assert(
    conditionalValidateSubmission(urgencyPath, deriveFacts(urgencyPath), NOW).some(
      (item) => item.field === "removal_date_value_known",
    ),
  );
});

test("unconfirmed past date is rejected", () => {
  const input = baseSubmission({
    urgency_flags: ["hearing_date"],
    hearing_date_value_known: "Yes, I know the exact date",
    hearing_date_value: "2026-08-09",
  });
  const issues = conditionalValidateSubmission(input, deriveFacts(input), NOW);
  assert(issues.some((item) => item.code === "PAST_DATE_CONFIRMATION_REQUIRED"));
});

test("confirmed past date passes conditional validation", () => {
  const input = baseSubmission({
    urgency_flags: ["hearing_date"],
    hearing_date_value_known: "Yes, I know the exact date",
    hearing_date_value: "2026-08-09",
    past_date_confirmations: { hearing_date_value: true },
  });
  assert.deepEqual(conditionalValidateSubmission(input, deriveFacts(input), NOW), []);
});

test("date unknown remains a valid answer", () => {
  const input = baseSubmission({
    urgency_flags: ["hearing_date"],
    hearing_date_value_known: "No / not sure",
  });
  assert.deepEqual(conditionalValidateSubmission(input, deriveFacts(input), NOW), []);
});

test("stale date is rejected when exact date is marked unknown", () => {
  const input = baseSubmission({
    urgency_flags: ["hearing_date"],
    hearing_date_value_known: "No / not sure",
    hearing_date_value: "2026-08-20",
  });
  const issues = conditionalValidateSubmission(input, deriveFacts(input), NOW);
  assert(issues.some((item) => item.code === "DATE_VALUE_INCONSISTENT"));
});

test("refusal and detention category follow-ups are mandatory", () => {
  const refusal = baseSubmission({
    category: "I received a refusal or Home Office decision",
    decision_deadline_status: "No deadline stated",
  });
  assert(
    conditionalValidateSubmission(refusal, deriveFacts(refusal), NOW).some(
      (item) => item.code === "LETTER_MENTIONS_REQUIRED",
    ),
  );

  const detention = baseSubmission({ category: "Detention / removal enquiry" });
  const issues = conditionalValidateSubmission(detention, deriveFacts(detention), NOW);
  assert(issues.some((item) => item.code === "DETENTION_STATUS_REQUIRED"));
  assert(issues.some((item) => item.code === "REMOVAL_DATE_STATUS_REQUIRED"));
});

test("stale past-date confirmation cannot manufacture CRITICAL routing input", () => {
  const input = baseSubmission({
    past_date_confirmations: { visa_expiry_date: true },
  });
  const issues = conditionalValidateSubmission(input, deriveFacts(input), NOW);
  assert(issues.some((item) => item.code === "STALE_PAST_DATE_CONFIRMATION"));
});

test("hidden conditional answers are rejected instead of influencing routing", () => {
  const input = baseSubmission({
    letter_mentions: "Not sure",
    decision_deadline_status: "Not sure",
    hearing_date_value_known: "No / not sure",
  });
  const issues = conditionalValidateSubmission(input, deriveFacts(input), NOW);
  assert(
    issues.some(
      (item) => item.field === "letter_mentions" && item.code === "HIDDEN_FIELD_NOT_ALLOWED",
    ),
  );
  assert(
    issues.some(
      (item) =>
        item.field === "decision_deadline_status" && item.code === "HIDDEN_FIELD_NOT_ALLOWED",
    ),
  );
  assert(
    issues.some(
      (item) =>
        item.field === "hearing_date_value" && item.code === "HIDDEN_DATE_STATE_NOT_ALLOWED",
    ),
  );
});

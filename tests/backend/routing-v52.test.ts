import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalIntakeSubmission,
  DerivedFacts,
} from "../../src/server/intake-v52/contracts.ts";
import {
  evaluateCondition,
  routeSubmission,
  ROUTING_RULES_V52,
} from "../../src/server/intake-v52/routing.ts";

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

function derived(overrides: Partial<DerivedFacts> = {}): DerivedFacts {
  return {
    effective_decision_received: false,
    effective_detained: false,
    effective_removal_date: false,
    detention_category_unresolved: false,
    location_uncertain: false,
    ...overrides,
  };
}

test("routing rule inventory exactly matches frozen v5.2", () => {
  assert.deepEqual(
    ROUTING_RULES_V52.map((rule) => rule.rule_id),
    [
      "CRITICAL_DETAINED",
      "CRITICAL_REMOVAL_DATE",
      "CRITICAL_PAST_DATE_CONFIRMED",
      "CRITICAL_DATE_RANGE",
      "URGENT_DATE_RANGE",
      "URGENT_DECISION_NO_DEADLINE",
      "PRIORITY_DATE_RANGE",
      "MANUAL_NOT_SURE_URGENCY",
      "MANUAL_NOT_SURE_DECISION_DEADLINE",
      "MANUAL_NOT_SURE_CATEGORY",
      "MANUAL_NOT_SURE_LETTER",
      "MANUAL_DATE_UNKNOWN",
      "MANUAL_DETENTION_UNRESOLVED",
      "MANUAL_LOCATION_UNCERTAIN",
      "ROUTINE_FALLBACK",
    ],
  );
});

test("manual review rules cover letter, unknown date and unresolved detention", () => {
  const letter = routeSubmission(baseSubmission({ letter_mentions: "Not sure" }), derived(), NOW);
  assert(letter.matched_rule_ids.includes("MANUAL_NOT_SURE_LETTER"));

  const dateUnknown = routeSubmission(
    baseSubmission({ hearing_date_value_known: "No / not sure" }),
    derived(),
    NOW,
  );
  assert(dateUnknown.matched_rule_ids.includes("MANUAL_DATE_UNKNOWN"));

  const detention = routeSubmission(
    baseSubmission({
      category: "Detention / removal enquiry",
      currently_detained: "No",
      removal_date_given: "No",
    }),
    derived({ detention_category_unresolved: true }),
    NOW,
  );
  assert(detention.matched_rule_ids.includes("MANUAL_DETENTION_UNRESOLVED"));
});

test("ROUTINE fallback for fully certain non-urgent facts", () => {
  const result = routeSubmission(baseSubmission(), derived(), NOW);
  assert.equal(result.priority, "ROUTINE");
  assert.deepEqual(result.matched_rule_ids, ["ROUTINE_FALLBACK"]);
});

test("detention is CRITICAL", () => {
  const result = routeSubmission(
    baseSubmission({
      category: "Detention / removal enquiry",
      currently_detained: "Yes",
      removal_date_given: "No",
    }),
    derived({ effective_detained: true }),
    NOW,
  );
  assert.equal(result.priority, "CRITICAL");
  assert(result.matched_rule_ids.includes("CRITICAL_DETAINED"));
});

test("removal-date existence is CRITICAL even when date is unknown", () => {
  const result = routeSubmission(
    baseSubmission({
      category: "Detention / removal enquiry",
      currently_detained: "No",
      removal_date_given: "Yes",
      removal_date_value_known: "No / not sure",
    }),
    derived({ effective_removal_date: true }),
    NOW,
  );
  assert.equal(result.priority, "CRITICAL");
  assert(result.matched_rule_ids.includes("CRITICAL_REMOVAL_DATE"));
  assert(result.matched_rule_ids.includes("MANUAL_DATE_UNKNOWN"));
});

test("confirmed past date is CRITICAL", () => {
  const result = routeSubmission(
    baseSubmission({
      urgency_flags: ["hearing_date"],
      hearing_date_value_known: "Yes, I know the exact date",
      hearing_date_value: "2026-08-09",
      past_date_confirmations: { hearing_date_value: true },
    }),
    derived(),
    NOW,
  );
  assert.equal(result.priority, "CRITICAL");
  assert(result.matched_rule_ids.includes("CRITICAL_PAST_DATE_CONFIRMED"));
});

test("0-3 day stated date is CRITICAL", () => {
  const result = routeSubmission(
    baseSubmission({
      urgency_flags: ["hearing_date"],
      hearing_date_value_known: "Yes, I know the exact date",
      hearing_date_value: "2026-08-13",
    }),
    derived(),
    NOW,
  );
  assert.equal(result.priority, "CRITICAL");
  assert(result.matched_rule_ids.includes("CRITICAL_DATE_RANGE"));
});

test("4-14 day stated date is URGENT", () => {
  const result = routeSubmission(
    baseSubmission({
      urgency_flags: ["hearing_date"],
      hearing_date_value_known: "Yes, I know the exact date",
      hearing_date_value: "2026-08-20",
    }),
    derived(),
    NOW,
  );
  assert.equal(result.priority, "URGENT");
  assert(result.matched_rule_ids.includes("URGENT_DATE_RANGE"));
});

test("15-28 day stated date is PRIORITY", () => {
  const result = routeSubmission(
    baseSubmission({
      urgency_flags: ["hearing_date"],
      hearing_date_value_known: "Yes, I know the exact date",
      hearing_date_value: "2026-09-01",
    }),
    derived(),
    NOW,
  );
  assert.equal(result.priority, "PRIORITY");
  assert(result.matched_rule_ids.includes("PRIORITY_DATE_RANGE"));
});

test("decision received with no stated deadline is URGENT", () => {
  const result = routeSubmission(
    baseSubmission({
      category: "I received a refusal or Home Office decision",
      letter_mentions: "Neither",
      decision_deadline_status: "No deadline stated",
    }),
    derived({ effective_decision_received: true }),
    NOW,
  );
  assert.equal(result.priority, "URGENT");
  assert(result.matched_rule_ids.includes("URGENT_DECISION_NO_DEADLINE"));
});

test("all not-sure paths are MANUAL_REVIEW", () => {
  const cases: [CanonicalIntakeSubmission, DerivedFacts, string][] = [
    [baseSubmission({ urgency_flags: ["not_sure"] }), derived(), "MANUAL_NOT_SURE_URGENCY"],
    [baseSubmission({ category: "Not sure" }), derived(), "MANUAL_NOT_SURE_CATEGORY"],
    [
      baseSubmission({
        category: "I received a refusal or Home Office decision",
        letter_mentions: "Not sure",
        decision_deadline_status: "Not sure",
      }),
      derived({ effective_decision_received: true }),
      "MANUAL_NOT_SURE_DECISION_DEADLINE",
    ],
    [
      baseSubmission({ location_status: "Not sure / other" }),
      derived({ location_uncertain: true }),
      "MANUAL_LOCATION_UNCERTAIN",
    ],
  ];
  for (const [submission, facts, rule] of cases) {
    const result = routeSubmission(submission, facts, NOW);
    assert.equal(result.priority, "MANUAL_REVIEW");
    assert(result.matched_rule_ids.includes(rule));
  }
});

test("higher severity wins when manual and critical rules both match", () => {
  const result = routeSubmission(
    baseSubmission({ urgency_flags: ["detained"], location_status: "Not sure / other" }),
    derived({ effective_detained: true, location_uncertain: true }),
    NOW,
  );
  assert.equal(result.priority, "CRITICAL");
  assert(result.matched_rule_ids.includes("CRITICAL_DETAINED"));
  assert(result.matched_rule_ids.includes("MANUAL_LOCATION_UNCERTAIN"));
});

test("condition interpreter covers every declared operator", () => {
  const context = {
    ...baseSubmission({
      urgency_flags: ["hearing_date"],
      hearing_date_value_known: "No / not sure",
      past_date_confirmations: { hearing_date_value: true },
      hearing_date_value: "2026-08-20",
    }),
    ...derived({ effective_detained: true }),
  };

  assert(
    evaluateCondition(
      { field: "category", operator: "equals", value: "Making a new application" },
      context,
      NOW,
    ),
  );
  assert(
    evaluateCondition(
      { field: "urgency_flags", operator: "contains", value: "hearing_date" },
      context,
      NOW,
    ),
  );
  assert(
    evaluateCondition(
      { field_group: "all_date_known_fields", operator: "any_equals", value: "No / not sure" },
      context,
      NOW,
    ),
  );
  assert(
    evaluateCondition(
      { field: "past_date_confirmations", operator: "object_any_equals", value: true },
      context,
      NOW,
    ),
  );
  assert(
    evaluateCondition(
      { field_group: "all_stated_dates", operator: "in_range", value: [4, 14] },
      context,
      NOW,
    ),
  );
  assert(
    evaluateCondition({ field: "effective_detained", operator: "boolean_true" }, context, NOW),
  );
  assert(
    evaluateCondition({ field: "location_uncertain", operator: "boolean_false" }, context, NOW),
  );
  assert(evaluateCondition({ operator: "default" }, context, NOW));
});

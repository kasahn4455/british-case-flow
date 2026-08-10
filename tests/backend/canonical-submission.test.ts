import assert from "node:assert/strict";
import test from "node:test";

import { toCanonicalSubmission } from "../../src/lib/intake/canonical-submission.ts";
import { emptyIntakeForm, type IntakeFormValues } from "../../src/lib/intake/schema.ts";
import {
  deriveFacts,
  conditionalValidateSubmission,
} from "../../src/server/intake-v52/semantics.ts";
import { baseValidateSubmission } from "../../src/server/intake-v52/validation.ts";

function baseValues(): IntakeFormValues {
  const values = structuredClone(emptyIntakeForm);
  values.fullName = "Demo Person";
  values.email = "demo@example.test";
  values.phone = "+44 7700 900123";
  values.contactMethod = "email";
  values.category = "new_application";
  values.location = "inside_uk";
  values.urgency = ["none"];
  values.existingRepresentative = "no";
  return values;
}

function map(values: IntakeFormValues) {
  return toCanonicalSubmission(values, {
    privacyNoticeVersion: "demo-v1",
    privacyNoticeUrl: "#privacy-notice-placeholder",
    privacyNoticeDisplayedAt: "2026-08-10T03:00:00.000Z",
  });
}

test("basic UI values map to the strict v5.2 server contract", () => {
  const payload = map(baseValues());

  assert.equal(payload.preferred_contact_method, "Email");
  assert.equal(payload.category, "Making a new application");
  assert.equal(payload.location_status, "Inside the UK");
  assert.deepEqual(payload.urgency_flags, ["none"]);
  assert.equal(payload.existing_representative, "No");
  assert.equal(payload.website, undefined);

  const validated = baseValidateSubmission(payload);
  assert.equal(validated.ok, true);
});

test("decision answers map to the server decision-deadline vocabulary", () => {
  const values = baseValues();
  values.category = "refusal_decision";
  values.letterWords = "appeal";
  values.urgency = ["ho_decision"];
  values.letterDeadlineStated = "no";

  const payload = map(values);
  assert.equal(payload.letter_mentions, "Appeal");
  assert.deepEqual(payload.urgency_flags, ["decision_received"]);
  assert.equal(payload.decision_deadline_status, "No deadline stated");

  const validated = baseValidateSubmission(payload);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const derived = deriveFacts(validated.value);
  assert.deepEqual(conditionalValidateSubmission(validated.value, derived), []);
});

test("confirmed past dates persist the exact confirmation map key", () => {
  const values = baseValues();
  values.urgency = ["hearing_date"];
  values.dates.hearing = {
    knowsExact: "yes",
    date: "2026-08-01",
    pastConfirmed: "yes",
  };

  const payload = map(values);
  assert.equal(payload.hearing_date_value_known, "Yes, I know the exact date");
  assert.equal(payload.hearing_date_value, "2026-08-01");
  assert.equal(payload.past_date_confirmations.hearing_date_value, true);

  const validated = baseValidateSubmission(payload);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const derived = deriveFacts(validated.value);
  assert.deepEqual(
    conditionalValidateSubmission(validated.value, derived, new Date("2026-08-10T12:00:00Z")),
    [],
  );
});

test("unconfirmed past dates remain rejectable by the authoritative backend", () => {
  const values = baseValues();
  values.urgency = ["hearing_date"];
  values.dates.hearing = {
    knowsExact: "yes",
    date: "2026-08-01",
    pastConfirmed: "",
  };

  const payload = map(values);
  const validated = baseValidateSubmission(payload);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const derived = deriveFacts(validated.value);
  const issues = conditionalValidateSubmission(
    validated.value,
    derived,
    new Date("2026-08-10T12:00:00Z"),
  );
  assert.ok(issues.some((issue) => issue.field === "past_date_confirmations.hearing_date_value"));
});

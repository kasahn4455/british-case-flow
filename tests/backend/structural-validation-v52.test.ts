import assert from "node:assert/strict";
import test from "node:test";

import { baseValidateSubmission } from "../../src/server/intake-v52/validation.ts";

function baseRaw() {
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
  };
}

test("valid base payload passes structural validation", () => {
  assert.equal(baseValidateSubmission(baseRaw()).ok, true);
});

test("client-supplied firm_id is rejected rather than trusted", () => {
  const result = baseValidateSubmission({
    ...baseRaw(),
    firm_id: "00000000-0000-0000-0000-000000000000",
  });
  assert.equal(result.ok, false);
});

test("malformed urgency exclusivity is 422-class structural invalidity, not manual review", () => {
  const result = baseValidateSubmission({ ...baseRaw(), urgency_flags: ["none", "detained"] });
  assert.equal(result.ok, false);
  if (!result.ok) assert(result.issues.some((item) => item.code === "URGENCY_EXCLUSIVITY"));
});

test("duplicate urgency flags are rejected", () => {
  const result = baseValidateSubmission({
    ...baseRaw(),
    urgency_flags: ["hearing_date", "hearing_date"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert(result.issues.some((item) => item.code === "URGENCY_DUPLICATE"));
});

test("invalid calendar dates are rejected structurally", () => {
  const result = baseValidateSubmission({
    ...baseRaw(),
    urgency_flags: ["hearing_date"],
    hearing_date_value_known: "Yes, I know the exact date",
    hearing_date_value: "2026-02-31",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert(result.issues.some((item) => item.code === "INVALID_DATE"));
});

test("identity field limits match v5.2", () => {
  assert.equal(baseValidateSubmission({ ...baseRaw(), full_name: "x".repeat(151) }).ok, false);
  assert.equal(
    baseValidateSubmission({ ...baseRaw(), email: `${"a".repeat(250)}@x.test` }).ok,
    false,
  );
  assert.equal(baseValidateSubmission({ ...baseRaw(), phone: "1".repeat(21) }).ok, false);
});

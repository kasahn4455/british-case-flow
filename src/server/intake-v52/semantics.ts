import type {
  CanonicalIntakeSubmission,
  DateFieldId,
  DerivedFacts,
  ValidationIssue,
} from "./contracts.ts";
import { isPastLondonDate, isValidCalendarDate } from "./date.ts";

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message };
}

export function deriveFacts(input: CanonicalIntakeSubmission): DerivedFacts {
  const effectiveDecisionReceived =
    input.category === "I received a refusal or Home Office decision" ||
    input.urgency_flags.includes("decision_received");
  const effectiveDetained =
    input.currently_detained === "Yes" || input.urgency_flags.includes("detained");
  const effectiveRemovalDate =
    input.removal_date_given === "Yes" || input.urgency_flags.includes("removal_date");

  return {
    effective_decision_received: effectiveDecisionReceived,
    effective_detained: effectiveDetained,
    effective_removal_date: effectiveRemovalDate,
    detention_category_unresolved:
      input.currently_detained === "Not sure" ||
      input.removal_date_given === "Not sure" ||
      (input.category === "Detention / removal enquiry" &&
        input.currently_detained === "No" &&
        input.removal_date_given === "No"),
    location_uncertain: input.location_status === "Not sure / other",
  };
}

const dateKnownByField = {
  visa_expiry_date: "visa_expiry_date_known",
  hearing_date_value: "hearing_date_value_known",
  removal_date_value: "removal_date_value_known",
  other_deadline_date: "other_deadline_date_known",
  decision_stated_deadline_date: "decision_stated_deadline_date_known",
} as const;

function requireKnownGate(
  input: CanonicalIntakeSubmission,
  dateField: DateFieldId,
  issues: ValidationIssue[],
  now: Date,
) {
  const knownField = dateKnownByField[dateField];
  const known = input[knownField];
  const date = input[dateField];

  if (!known) {
    issues.push(issue(knownField, "DATE_KNOWN_REQUIRED", "Select whether you know the exact date"));
    return;
  }

  if (known === "No / not sure") {
    if (date) {
      issues.push(
        issue(
          dateField,
          "DATE_VALUE_INCONSISTENT",
          "Remove the date when the exact date is not known",
        ),
      );
    }
    return;
  }

  if (!date) {
    issues.push(issue(dateField, "DATE_REQUIRED", "Enter the exact date"));
    return;
  }
  if (!isValidCalendarDate(date)) {
    issues.push(issue(dateField, "INVALID_DATE", "Enter a valid calendar date"));
    return;
  }
  if (isPastLondonDate(date, now) && input.past_date_confirmations[dateField] !== true) {
    issues.push(
      issue(
        `past_date_confirmations.${dateField}`,
        "PAST_DATE_CONFIRMATION_REQUIRED",
        "Confirm that the past date entered is the date intended",
      ),
    );
  }
}

function rejectHiddenDateState(
  input: CanonicalIntakeSubmission,
  dateField: DateFieldId,
  issues: ValidationIssue[],
) {
  const knownField = dateKnownByField[dateField];
  if (input[knownField] !== undefined || input[dateField] !== undefined) {
    issues.push(
      issue(
        dateField,
        "HIDDEN_DATE_STATE_NOT_ALLOWED",
        "Remove answers for a date question that is not applicable",
      ),
    );
  }
}

export function conditionalValidateSubmission(
  input: CanonicalIntakeSubmission,
  derived: DerivedFacts,
  now: Date = new Date(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const refusalCategory = input.category === "I received a refusal or Home Office decision";
  const detentionCategory = input.category === "Detention / removal enquiry";

  if (refusalCategory && !input.letter_mentions) {
    issues.push(issue("letter_mentions", "LETTER_MENTIONS_REQUIRED", "Select an option"));
  } else if (!refusalCategory && input.letter_mentions !== undefined) {
    issues.push(
      issue(
        "letter_mentions",
        "HIDDEN_FIELD_NOT_ALLOWED",
        "Remove an answer for a question that is not applicable",
      ),
    );
  }

  if (detentionCategory) {
    if (!input.currently_detained) {
      issues.push(issue("currently_detained", "DETENTION_STATUS_REQUIRED", "Select an option"));
    }
    if (!input.removal_date_given) {
      issues.push(issue("removal_date_given", "REMOVAL_DATE_STATUS_REQUIRED", "Select an option"));
    }
  } else {
    if (input.currently_detained !== undefined) {
      issues.push(
        issue(
          "currently_detained",
          "HIDDEN_FIELD_NOT_ALLOWED",
          "Remove an answer for a question that is not applicable",
        ),
      );
    }
    if (input.removal_date_given !== undefined) {
      issues.push(
        issue(
          "removal_date_given",
          "HIDDEN_FIELD_NOT_ALLOWED",
          "Remove an answer for a question that is not applicable",
        ),
      );
    }
  }

  if (derived.effective_decision_received) {
    if (!input.decision_deadline_status) {
      issues.push(
        issue(
          "decision_deadline_status",
          "DECISION_DEADLINE_STATUS_REQUIRED",
          "Select whether the letter states a response deadline",
        ),
      );
    }
  } else if (input.decision_deadline_status !== undefined) {
    issues.push(
      issue(
        "decision_deadline_status",
        "HIDDEN_FIELD_NOT_ALLOWED",
        "Remove an answer for a question that is not applicable",
      ),
    );
  }

  if (input.urgency_flags.includes("visa_expiring")) {
    requireKnownGate(input, "visa_expiry_date", issues, now);
  } else {
    rejectHiddenDateState(input, "visa_expiry_date", issues);
  }

  if (input.urgency_flags.includes("hearing_date")) {
    requireKnownGate(input, "hearing_date_value", issues, now);
  } else {
    rejectHiddenDateState(input, "hearing_date_value", issues);
  }

  if (input.urgency_flags.includes("deadline_given")) {
    requireKnownGate(input, "other_deadline_date", issues, now);
  } else {
    rejectHiddenDateState(input, "other_deadline_date", issues);
  }

  if (derived.effective_removal_date) {
    requireKnownGate(input, "removal_date_value", issues, now);
  } else {
    rejectHiddenDateState(input, "removal_date_value", issues);
  }

  if (input.decision_deadline_status === "Yes — deadline stated") {
    requireKnownGate(input, "decision_stated_deadline_date", issues, now);
  } else {
    rejectHiddenDateState(input, "decision_stated_deadline_date", issues);
  }

  for (const [dateField, confirmed] of Object.entries(input.past_date_confirmations)) {
    if (confirmed !== true) continue;
    const value = input[dateField as DateFieldId];
    if (typeof value !== "string" || !isValidCalendarDate(value) || !isPastLondonDate(value, now)) {
      issues.push(
        issue(
          `past_date_confirmations.${dateField}`,
          "STALE_PAST_DATE_CONFIRMATION",
          "Past-date confirmation must correspond to a submitted past date",
        ),
      );
    }
  }

  return issues;
}

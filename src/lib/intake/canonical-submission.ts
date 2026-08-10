import {
  CATEGORIES,
  CONTACT_METHODS,
  CONTACT_TIMES,
  EXISTING_REP_OPTIONS,
  LETTER_DEADLINE_OPTIONS,
  LETTER_WORDS,
  LOCATIONS,
  YES_NO_NOT_SURE,
  labelFor,
} from "./options";
import type { DateAnswer, IntakeFormValues } from "./schema";

export type CanonicalSubmissionPayload = {
  full_name: string;
  email: string;
  phone: string;
  preferred_contact_method: string;
  preferred_contact_time?: string;
  category: string;
  letter_mentions?: string;
  currently_detained?: string;
  removal_date_given?: string;
  location_status: string;
  urgency_flags: string[];
  visa_expiry_date_known?: string;
  visa_expiry_date?: string;
  hearing_date_value_known?: string;
  hearing_date_value?: string;
  removal_date_value_known?: string;
  removal_date_value?: string;
  other_deadline_date_known?: string;
  other_deadline_date?: string;
  decision_deadline_status?: string;
  decision_stated_deadline_date_known?: string;
  decision_stated_deadline_date?: string;
  past_date_confirmations: Record<string, boolean>;
  previous_names?: string;
  spouse_partner_name?: string;
  sponsoring_employer?: string;
  existing_representative: string;
  privacy_notice_version: string;
  privacy_notice_url: string;
  privacy_notice_displayed_at: string;
  website?: string;
};

const URGENCY_TO_CANONICAL: Record<string, string> = {
  visa_expiry: "visa_expiring",
  ho_decision: "decision_received",
  given_deadline: "deadline_given",
  hearing_date: "hearing_date",
  detained: "detained",
  removal_date: "removal_date",
  none: "none",
  not_sure: "not_sure",
};

const DATE_KNOWN_TO_CANONICAL: Record<string, string> = {
  yes: "Yes, I know the exact date",
  no: "No / not sure",
};

function addOptionalText(target: CanonicalSubmissionPayload, key: keyof CanonicalSubmissionPayload, value: string) {
  const trimmed = value.trim();
  if (trimmed) Object.assign(target, { [key]: trimmed });
}

function addDate(
  target: CanonicalSubmissionPayload,
  answer: DateAnswer,
  knownField: keyof CanonicalSubmissionPayload,
  dateField: keyof CanonicalSubmissionPayload,
  canonicalDateField: string,
) {
  if (!answer.knowsExact) return;
  Object.assign(target, { [knownField]: DATE_KNOWN_TO_CANONICAL[answer.knowsExact] });
  if (answer.knowsExact !== "yes" || !answer.date) return;
  Object.assign(target, { [dateField]: answer.date });
  if (answer.pastConfirmed === "yes") {
    target.past_date_confirmations[canonicalDateField] = true;
  }
}

export function toCanonicalSubmission(
  values: IntakeFormValues,
  options: {
    privacyNoticeVersion: string;
    privacyNoticeUrl: string;
    privacyNoticeDisplayedAt: string;
    website?: string;
  },
): CanonicalSubmissionPayload {
  const payload: CanonicalSubmissionPayload = {
    full_name: values.fullName.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    preferred_contact_method: labelFor(CONTACT_METHODS, values.contactMethod),
    category: labelFor(CATEGORIES, values.category),
    location_status: labelFor(LOCATIONS, values.location),
    urgency_flags: values.urgency.map((value) => URGENCY_TO_CANONICAL[value]),
    past_date_confirmations: {},
    existing_representative: labelFor(EXISTING_REP_OPTIONS, values.existingRepresentative),
    privacy_notice_version: options.privacyNoticeVersion,
    privacy_notice_url: options.privacyNoticeUrl,
    privacy_notice_displayed_at: options.privacyNoticeDisplayedAt,
  };

  if (values.contactTime) {
    payload.preferred_contact_time = labelFor(CONTACT_TIMES, values.contactTime);
  }
  if (values.letterWords) payload.letter_mentions = labelFor(LETTER_WORDS, values.letterWords);
  if (values.currentlyDetained) {
    payload.currently_detained = labelFor(YES_NO_NOT_SURE, values.currentlyDetained);
  }
  if (values.removalDateGiven) {
    payload.removal_date_given = labelFor(YES_NO_NOT_SURE, values.removalDateGiven);
  }
  if (values.letterDeadlineStated) {
    payload.decision_deadline_status = labelFor(
      LETTER_DEADLINE_OPTIONS,
      values.letterDeadlineStated,
    );
  }

  addDate(
    payload,
    values.dates.visaExpiry,
    "visa_expiry_date_known",
    "visa_expiry_date",
    "visa_expiry_date",
  );
  addDate(
    payload,
    values.dates.hearing,
    "hearing_date_value_known",
    "hearing_date_value",
    "hearing_date_value",
  );
  addDate(
    payload,
    values.dates.removal,
    "removal_date_value_known",
    "removal_date_value",
    "removal_date_value",
  );
  addDate(
    payload,
    values.dates.statedDeadline,
    "other_deadline_date_known",
    "other_deadline_date",
    "other_deadline_date",
  );
  addDate(
    payload,
    values.dates.letterDeadline,
    "decision_stated_deadline_date_known",
    "decision_stated_deadline_date",
    "decision_stated_deadline_date",
  );

  addOptionalText(payload, "previous_names", values.previousNames);
  addOptionalText(payload, "spouse_partner_name", values.partnerName);
  addOptionalText(payload, "sponsoring_employer", values.sponsoringEmployer);

  const honeypot = options.website?.trim();
  if (honeypot) payload.website = honeypot;

  return payload;
}

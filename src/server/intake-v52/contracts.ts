export const SCHEMA_VERSION = "5.2" as const;
export const ROUTING_RULE_VERSION = "v5.2" as const;

export const PRIORITIES = ["CRITICAL", "URGENT", "PRIORITY", "MANUAL_REVIEW", "ROUTINE"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  "Making a new application",
  "I received a refusal or Home Office decision",
  "I have an appeal/tribunal matter already open",
  "Detention / removal enquiry",
  "Asylum / protection",
  "Sponsor licence / business immigration",
  "Citizenship / nationality",
  "Settlement / Indefinite Leave to Remain",
  "EU Settlement Scheme",
  "Other immigration matter",
  "Not sure",
] as const;

export const LETTER_MENTIONS = ["Appeal", "Administrative review", "Neither", "Not sure"] as const;
export const YES_NO_NOT_SURE = ["Yes", "No", "Not sure"] as const;
export const LOCATIONS = ["Inside the UK", "Outside the UK", "Not sure / other"] as const;
export const CONTACT_METHODS = ["Phone call", "Email", "SMS", "Either"] as const;
export const CONTACT_TIMES = ["Morning", "Afternoon", "Evening", "Any time"] as const;
export const URGENCY_FLAGS = [
  "visa_expiring",
  "decision_received",
  "deadline_given",
  "hearing_date",
  "detained",
  "removal_date",
  "none",
  "not_sure",
] as const;
export const DATE_KNOWN_OPTIONS = ["Yes, I know the exact date", "No / not sure"] as const;
export const DECISION_DEADLINE_OPTIONS = [
  "Yes — deadline stated",
  "No deadline stated",
  "Not sure",
] as const;

export const DATE_FIELD_IDS = [
  "visa_expiry_date",
  "hearing_date_value",
  "removal_date_value",
  "other_deadline_date",
  "decision_stated_deadline_date",
] as const;
export type DateFieldId = (typeof DATE_FIELD_IDS)[number];

export const DATE_KNOWN_FIELD_IDS = [
  "visa_expiry_date_known",
  "hearing_date_value_known",
  "removal_date_value_known",
  "other_deadline_date_known",
  "decision_stated_deadline_date_known",
] as const;
export type DateKnownFieldId = (typeof DATE_KNOWN_FIELD_IDS)[number];

export type CanonicalIntakeSubmission = {
  full_name: string;
  email: string;
  phone: string;
  preferred_contact_method: (typeof CONTACT_METHODS)[number];
  preferred_contact_time?: (typeof CONTACT_TIMES)[number];

  category: (typeof CATEGORIES)[number];
  letter_mentions?: (typeof LETTER_MENTIONS)[number];
  currently_detained?: (typeof YES_NO_NOT_SURE)[number];
  removal_date_given?: (typeof YES_NO_NOT_SURE)[number];
  location_status: (typeof LOCATIONS)[number];
  urgency_flags: (typeof URGENCY_FLAGS)[number][];

  visa_expiry_date_known?: (typeof DATE_KNOWN_OPTIONS)[number];
  visa_expiry_date?: string;
  hearing_date_value_known?: (typeof DATE_KNOWN_OPTIONS)[number];
  hearing_date_value?: string;
  removal_date_value_known?: (typeof DATE_KNOWN_OPTIONS)[number];
  removal_date_value?: string;
  other_deadline_date_known?: (typeof DATE_KNOWN_OPTIONS)[number];
  other_deadline_date?: string;

  decision_deadline_status?: (typeof DECISION_DEADLINE_OPTIONS)[number];
  decision_stated_deadline_date_known?: (typeof DATE_KNOWN_OPTIONS)[number];
  decision_stated_deadline_date?: string;

  past_date_confirmations: Partial<Record<DateFieldId, boolean>>;

  previous_names?: string;
  spouse_partner_name?: string;
  sponsoring_employer?: string;
  existing_representative: "Yes" | "No";

  privacy_notice_version: string;
  privacy_notice_url: string;
  privacy_notice_displayed_at: string;

  /** Hidden honeypot. Normal human submissions leave this blank or omit it. */
  website?: string;
};

export type DerivedFacts = {
  effective_decision_received: boolean;
  effective_detained: boolean;
  effective_removal_date: boolean;
  detention_category_unresolved: boolean;
  location_uncertain: boolean;
};

export type ValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export type Condition = {
  field?: string;
  field_group?: string;
  operator?:
    | "equals"
    | "contains"
    | "any_equals"
    | "object_any_equals"
    | "in_range"
    | "boolean_true"
    | "boolean_false"
    | "default";
  value?: unknown;
  all?: Condition[];
  any?: Condition[];
};

export type RoutingResult = {
  priority: Priority;
  matched_rule_ids: string[];
  priority_reason: string;
  derived_facts: DerivedFacts;
  routing_rule_version: typeof ROUTING_RULE_VERSION;
};

export type ResolvedPublishedForm = {
  id: string;
  firm_id: string;
  configuration_id: string;
};

export type PersistedSubmissionResult = {
  enquiry_id: string;
  enquiry_reference: string;
};

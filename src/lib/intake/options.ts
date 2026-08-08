export type Option = { value: string; label: string };

export const CONTACT_METHODS: Option[] = [
  { value: "phone", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "either", label: "Either" },
];

export const CONTACT_TIMES: Option[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "any", label: "Any time" },
];

export const CATEGORY_REFUSAL = "refusal_decision";
export const CATEGORY_DETENTION = "detention_removal";

export const CATEGORIES: Option[] = [
  { value: "new_application", label: "Making a new application" },
  { value: CATEGORY_REFUSAL, label: "I received a refusal or Home Office decision" },
  { value: "appeal_open", label: "I have an appeal/tribunal matter already open" },
  { value: CATEGORY_DETENTION, label: "Detention / removal enquiry" },
  { value: "asylum", label: "Asylum / protection" },
  { value: "sponsor_licence", label: "Sponsor licence / business immigration" },
  { value: "citizenship", label: "Citizenship / nationality" },
  { value: "settlement", label: "Settlement / Indefinite Leave to Remain" },
  { value: "euss", label: "EU Settlement Scheme" },
  { value: "other", label: "Other immigration matter" },
  { value: "not_sure", label: "Not sure" },
];

export const LETTER_WORDS: Option[] = [
  { value: "appeal", label: "Appeal" },
  { value: "administrative_review", label: "Administrative review" },
  { value: "neither", label: "Neither" },
  { value: "not_sure", label: "Not sure" },
];

export const YES_NO_NOT_SURE: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_sure", label: "Not sure" },
];

export const LOCATIONS: Option[] = [
  { value: "inside_uk", label: "Inside the UK" },
  { value: "outside_uk", label: "Outside the UK" },
  { value: "not_sure", label: "Not sure / other" },
];

export const URGENCY_VISA_EXPIRY = "visa_expiry";
export const URGENCY_HO_DECISION = "ho_decision";
export const URGENCY_DEADLINE = "given_deadline";
export const URGENCY_HEARING = "hearing_date";
export const URGENCY_DETAINED = "detained";
export const URGENCY_REMOVAL = "removal_date";
export const URGENCY_NONE = "none";
export const URGENCY_NOT_SURE = "not_sure";

export const URGENCY_EXCLUSIVE: string[] = [URGENCY_NONE, URGENCY_NOT_SURE];

export const URGENCY_OPTIONS: Option[] = [
  { value: URGENCY_VISA_EXPIRY, label: "My visa/permission has or will expire soon" },
  { value: URGENCY_HO_DECISION, label: "I have received a Home Office decision" },
  { value: URGENCY_DEADLINE, label: "I have been given a deadline" },
  { value: URGENCY_HEARING, label: "I have a hearing date" },
  { value: URGENCY_DETAINED, label: "I am currently detained" },
  { value: URGENCY_REMOVAL, label: "I have been given a removal/deportation date" },
  { value: URGENCY_NONE, label: "None of these" },
  { value: URGENCY_NOT_SURE, label: "Not sure" },
];

export const LETTER_DEADLINE_OPTIONS: Option[] = [
  { value: "yes", label: "Yes — deadline stated" },
  { value: "no", label: "No deadline stated" },
  { value: "not_sure", label: "Not sure" },
];

export const KNOWS_DATE_OPTIONS: Option[] = [
  { value: "yes", label: "Yes, I know the exact date" },
  { value: "no", label: "No / not sure" },
];

export const EXISTING_REP_OPTIONS: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function labelFor(options: Option[], value: string | undefined) {
  return options.find((o) => o.value === value)?.label ?? "Not provided";
}

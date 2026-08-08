/**
 * Fictional firm configuration for the Phase 1 prototype.
 * Single source of truth — never hardcode the firm name in components.
 */
export const FIRM = {
  name: "Hamilton Immigration Solicitors",
  shortName: "Hamilton Immigration",
  privacyPolicyUrl: "#privacy-notice-placeholder",
  phone: "+44 20 7946 0812",
  email: "enquiries@hamilton-immigration.example",
  address: "12 Bedford Row, London WC1R 4BU",
  regulatoryNote: "Fictional firm — prototype demonstration only",
} as const;

export const AUTOMATED_RULES_STATEMENT =
  "We use automated rules to prioritise and route enquiries based on the answers you provide. These rules do not determine your immigration rights or provide legal advice.";

/** Verbatim acknowledgement wording. Do not paraphrase or edit. */
export const ACKNOWLEDGEMENT_PARAGRAPHS = [
  `Thank you for contacting ${FIRM.name}. We have received your enquiry and will review the information provided.`,
  `Submitting this form does not mean that ${FIRM.name} has agreed to act for you. Please do not assume that any immigration or tribunal deadline has been protected until the firm confirms this expressly.`,
  "If you believe you have an urgent deadline and have not already provided it above, please contact the firm directly and immediately.",
] as const;

export const DEMO_MODE_LABEL = "Demo mode — fictional data only";

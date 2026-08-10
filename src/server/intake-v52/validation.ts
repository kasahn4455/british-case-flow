import { z } from "zod";

import {
  CATEGORIES,
  CONTACT_METHODS,
  CONTACT_TIMES,
  DATE_FIELD_IDS,
  DATE_KNOWN_OPTIONS,
  DECISION_DEADLINE_OPTIONS,
  LETTER_MENTIONS,
  LOCATIONS,
  URGENCY_FLAGS,
  YES_NO_NOT_SURE,
  type CanonicalIntakeSubmission,
  type ValidationIssue,
} from "./contracts.ts";
import { isValidCalendarDate } from "./date.ts";

const optionalTrimmed = (max: number) => z.string().trim().max(max).optional();
const dateValue = z.string().optional();
const dateKnown = z.enum(DATE_KNOWN_OPTIONS).optional();

const submissionSchema = z
  .object({
    full_name: z.string().trim().min(1).max(150),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(6).max(20).regex(/^[0-9+()\s-]+$/),
    preferred_contact_method: z.enum(CONTACT_METHODS),
    preferred_contact_time: z.enum(CONTACT_TIMES).optional(),

    category: z.enum(CATEGORIES),
    letter_mentions: z.enum(LETTER_MENTIONS).optional(),
    currently_detained: z.enum(YES_NO_NOT_SURE).optional(),
    removal_date_given: z.enum(YES_NO_NOT_SURE).optional(),
    location_status: z.enum(LOCATIONS),
    urgency_flags: z.array(z.enum(URGENCY_FLAGS)).min(1).max(URGENCY_FLAGS.length),

    visa_expiry_date_known: dateKnown,
    visa_expiry_date: dateValue,
    hearing_date_value_known: dateKnown,
    hearing_date_value: dateValue,
    removal_date_value_known: dateKnown,
    removal_date_value: dateValue,
    other_deadline_date_known: dateKnown,
    other_deadline_date: dateValue,

    decision_deadline_status: z.enum(DECISION_DEADLINE_OPTIONS).optional(),
    decision_stated_deadline_date_known: dateKnown,
    decision_stated_deadline_date: dateValue,

    past_date_confirmations: z.record(z.enum(DATE_FIELD_IDS), z.boolean()).default({}),

    previous_names: optionalTrimmed(200),
    spouse_partner_name: optionalTrimmed(200),
    sponsoring_employer: optionalTrimmed(200),
    existing_representative: z.enum(["Yes", "No"]),

    privacy_notice_version: z.string().trim().min(1).max(100),
    privacy_notice_url: z.string().trim().min(1).max(500),
    privacy_notice_displayed_at: z.string().datetime({ offset: true }),

    website: z.string().max(200).optional(),
  })
  .strict();

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message };
}

export type BaseValidationResult =
  | { ok: true; value: CanonicalIntakeSubmission }
  | { ok: false; issues: ValidationIssue[] };

export function baseValidateSubmission(raw: unknown): BaseValidationResult {
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((zodIssue) =>
        issue(
          zodIssue.path.length ? zodIssue.path.join(".") : "$",
          `STRUCTURE_${zodIssue.code.toUpperCase()}`,
          zodIssue.message,
        ),
      ),
    };
  }

  const value = parsed.data as CanonicalIntakeSubmission;
  const issues: ValidationIssue[] = [];
  const uniqueUrgency = new Set(value.urgency_flags);
  if (uniqueUrgency.size !== value.urgency_flags.length) {
    issues.push(issue("urgency_flags", "URGENCY_DUPLICATE", "Urgency selections must be unique"));
  }

  const exclusive = value.urgency_flags.filter((flag) => flag === "none" || flag === "not_sure");
  if (exclusive.length > 0 && value.urgency_flags.length !== 1) {
    issues.push(
      issue(
        "urgency_flags",
        "URGENCY_EXCLUSIVITY",
        "None and Not sure cannot be combined with other urgency selections",
      ),
    );
  }

  for (const field of DATE_FIELD_IDS) {
    const valueAtField = value[field];
    if (typeof valueAtField === "string" && valueAtField !== "" && !isValidCalendarDate(valueAtField)) {
      issues.push(issue(field, "INVALID_DATE", "Enter a valid calendar date"));
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, value };
}

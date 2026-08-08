import {
  CATEGORY_DETENTION,
  CATEGORY_REFUSAL,
  URGENCY_DEADLINE,
  URGENCY_EXCLUSIVE,
  URGENCY_HEARING,
  URGENCY_HO_DECISION,
  URGENCY_REMOVAL,
  URGENCY_VISA_EXPIRY,
} from "./options";
import type { IntakeFormValues } from "./schema";

/**
 * Pure show/hide predicates. These exist ONLY to keep the form relevant to the
 * person filling it in. They never determine priority, routing or any legal
 * outcome — the backend will be authoritative in a later phase.
 */

export const showLetterWords = (v: IntakeFormValues) => v.category === CATEGORY_REFUSAL;

export const showDetentionQuestions = (v: IntakeFormValues) => v.category === CATEGORY_DETENTION;

export const showRemovalDateFromDetention = (v: IntakeFormValues) =>
  showDetentionQuestions(v) && v.removalDateGiven === "yes";

export const showVisaExpiryDate = (v: IntakeFormValues) => v.urgency.includes(URGENCY_VISA_EXPIRY);
export const showHearingDate = (v: IntakeFormValues) => v.urgency.includes(URGENCY_HEARING);
export const showRemovalDate = (v: IntakeFormValues) =>
  v.urgency.includes(URGENCY_REMOVAL) || showRemovalDateFromDetention(v);
export const showStatedDeadlineDate = (v: IntakeFormValues) => v.urgency.includes(URGENCY_DEADLINE);

export const showLetterDeadlineQuestion = (v: IntakeFormValues) =>
  v.category === CATEGORY_REFUSAL || v.urgency.includes(URGENCY_HO_DECISION);

export const showLetterDeadlineDate = (v: IntakeFormValues) =>
  showLetterDeadlineQuestion(v) && v.letterDeadlineStated === "yes";

/**
 * Single reducer for the mutually-exclusive urgency rules:
 * - selecting any substantive option disables "None of these" and "Not sure"
 * - selecting "None of these" or "Not sure" clears and disables everything else
 */
export function nextUrgencySelection(
  current: string[],
  toggled: string,
  checked: boolean,
): string[] {
  if (!checked) return current.filter((v) => v !== toggled);
  if (URGENCY_EXCLUSIVE.includes(toggled)) return [toggled];
  return [...current.filter((v) => !URGENCY_EXCLUSIVE.includes(v)), toggled];
}

export function isUrgencyOptionDisabled(current: string[], option: string): boolean {
  const hasSubstantive = current.some((v) => !URGENCY_EXCLUSIVE.includes(v));
  const hasExclusive = current.some((v) => URGENCY_EXCLUSIVE.includes(v));
  if (URGENCY_EXCLUSIVE.includes(option)) return hasSubstantive;
  return hasExclusive;
}

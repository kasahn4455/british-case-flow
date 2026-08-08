import { z } from "zod";

/**
 * UX-only validation: required visible fields, formats, max lengths,
 * mutually exclusive selections and date input validity.
 *
 * This module MUST NOT compute, infer or suggest any priority value
 * (CRITICAL / URGENT / PRIORITY / MANUAL_REVIEW / ROUTINE), and MUST NOT
 * perform any deadline arithmetic or legal interpretation.
 */

export type DateAnswer = {
  knowsExact: string; // "yes" | "no" | ""
  date: string; // yyyy-mm-dd
  pastConfirmed: string; // "yes" | "no" | ""
};

export const emptyDateAnswer: DateAnswer = {
  knowsExact: "",
  date: "",
  pastConfirmed: "",
};

export type IntakeFormValues = {
  fullName: string;
  email: string;
  phone: string;
  contactMethod: string;
  contactTime: string;
  category: string;
  letterWords: string;
  currentlyDetained: string;
  removalDateGiven: string;
  location: string;
  urgency: string[];
  letterDeadlineStated: string;
  dates: {
    visaExpiry: DateAnswer;
    hearing: DateAnswer;
    removal: DateAnswer;
    statedDeadline: DateAnswer;
    letterDeadline: DateAnswer;
  };
  previousNames: string;
  partnerName: string;
  sponsoringEmployer: string;
  existingRepresentative: string;
};

export type DateKey = keyof IntakeFormValues["dates"];

export const emptyIntakeForm: IntakeFormValues = {
  fullName: "",
  email: "",
  phone: "",
  contactMethod: "",
  contactTime: "",
  category: "",
  letterWords: "",
  currentlyDetained: "",
  removalDateGiven: "",
  location: "",
  urgency: [],
  letterDeadlineStated: "",
  dates: {
    visaExpiry: { ...emptyDateAnswer },
    hearing: { ...emptyDateAnswer },
    removal: { ...emptyDateAnswer },
    statedDeadline: { ...emptyDateAnswer },
    letterDeadline: { ...emptyDateAnswer },
  },
  previousNames: "",
  partnerName: "",
  sponsoringEmployer: "",
  existingRepresentative: "",
};

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const detailsSchema = z.object({
  fullName: requiredText("Full name", 120),
  email: requiredText("Email", 200).pipe(z.string().email("Enter a valid email address")),
  phone: requiredText("Phone", 40).regex(/^[0-9+()\s-]{6,40}$/, "Enter a valid phone number"),
  contactMethod: z.string().min(1, "Select a preferred contact method"),
  contactTime: z.string().min(1, "Select a preferred contact time"),
});

export const optionalTextSchema = z
  .string()
  .trim()
  .max(200, "Must be 200 characters or fewer");

export type FieldErrors = Record<string, string>;

/** Returns true when a yyyy-mm-dd string is a valid calendar date. */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Pure data-entry check: is the entered calendar date earlier than today? */
export function isBeforeToday(value: string): boolean {
  if (!isValidDateString(value)) return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  return value < todayStr;
}

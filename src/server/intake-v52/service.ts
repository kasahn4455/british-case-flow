import type { PersistedSubmissionResult, ValidationIssue } from "./contracts.ts";
import {
  hashSubmission,
  persistSubmissionAtomically,
  resolvePublishedForm,
} from "./persistence.ts";
import { routeSubmission } from "./routing.ts";
import { conditionalValidateSubmission, deriveFacts } from "./semantics.ts";
import { baseValidateSubmission } from "./validation.ts";

export class SubmissionValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super("Submission validation failed");
    this.name = "SubmissionValidationError";
  }
}

export class PublishedFormNotFoundError extends Error {
  constructor() {
    super("Published form not found");
    this.name = "PublishedFormNotFoundError";
  }
}

export type ProcessSubmissionResult = PersistedSubmissionResult | { suspected_abuse: true };

/**
 * Authoritative v5.2 order:
 * 1) server resolves published_form_id -> firm_id
 * 2) base structural validation
 * 3) derived facts
 * 4) conditional validation
 * 5) deterministic routing/highest severity
 * 6) one atomic database RPC persists enquiry+routing+audit+both outbox events
 *
 * No LLM/AI is used anywhere in this path.
 */
export async function processPublicIntakeSubmission(args: {
  publishedFormId: string;
  rawSubmission: unknown;
  now?: Date;
}): Promise<ProcessSubmissionResult> {
  const resolved = await resolvePublishedForm(args.publishedFormId);
  if (!resolved) throw new PublishedFormNotFoundError();

  const base = baseValidateSubmission(args.rawSubmission);
  if (!base.ok) throw new SubmissionValidationError(base.issues);

  // Honeypot is intentionally checked only after the form ID is confirmed valid.
  // Return a neutral success to suspected automation without creating an enquiry.
  if (base.value.website?.trim()) return { suspected_abuse: true };

  const derived = deriveFacts(base.value);
  const conditionalIssues = conditionalValidateSubmission(base.value, derived, args.now);
  if (conditionalIssues.length) throw new SubmissionValidationError(conditionalIssues);

  const routing = routeSubmission(base.value, derived, args.now);
  const submissionHash = await hashSubmission(base.value);

  return persistSubmissionAtomically({
    publishedFormId: args.publishedFormId,
    submission: base.value,
    submissionHash,
    routing,
  });
}

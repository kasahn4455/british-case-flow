import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckboxGroupField } from "@/components/intake/CheckboxGroupField";
import { IntakeShell } from "@/components/intake/IntakeShell";
import { KnownDateField } from "@/components/intake/KnownDateField";
import { RadioGroupField } from "@/components/intake/RadioGroupField";
import { SectionCard } from "@/components/intake/SectionCard";
import { TextField } from "@/components/intake/TextField";
import { TurnstileField } from "@/components/intake/TurnstileField";
import { toCanonicalSubmission } from "@/lib/intake/canonical-submission";
import {
  CATEGORIES,
  CONTACT_METHODS,
  CONTACT_TIMES,
  EXISTING_REP_OPTIONS,
  LETTER_DEADLINE_OPTIONS,
  LETTER_WORDS,
  LOCATIONS,
  URGENCY_OPTIONS,
  YES_NO_NOT_SURE,
} from "@/lib/intake/options";
import {
  detailsSchema,
  isBeforeToday,
  isValidDateString,
  emptyDateAnswer,
  emptyIntakeForm,
  type DateAnswer,
  type DateKey,
  type FieldErrors,
  type IntakeFormValues,
} from "@/lib/intake/schema";
import {
  isUrgencyOptionDisabled,
  nextUrgencySelection,
  showDetentionQuestions,
  showHearingDate,
  showLetterDeadlineDate,
  showLetterDeadlineQuestion,
  showLetterWords,
  showRemovalDate,
  showStatedDeadlineDate,
  showVisaExpiryDate,
} from "@/lib/intake/visibility";
import { AUTOMATED_RULES_STATEMENT, FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/intake/$publishedFormId/")({
  head: () => ({
    meta: [
      { title: `Immigration enquiry form — ${FIRM.name}` },
      {
        name: "description",
        content:
          "Send an enquiry to Hamilton Immigration Solicitors. Tell us how to contact you and any dates you have been given. Prototype form with fictional data.",
      },
      { property: "og:title", content: `Immigration enquiry form — ${FIRM.name}` },
      {
        property: "og:description",
        content:
          "Send an enquiry to Hamilton Immigration Solicitors. Prototype form using fictional data only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IntakeForm,
});

/**
 * Frontend responsibilities only: field display, conditional visibility,
 * UX validation and transport to the authoritative server endpoint. No priority,
 * routing, deadline calculation or legal interpretation happens here.
 */
function IntakeForm() {
  const { publishedFormId } = Route.useParams();
  const navigate = useNavigate();
  const [values, setValues] = useState<IntakeFormValues>(emptyIntakeForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [privacyNoticeDisplayedAt] = useState(() => new Date().toISOString());
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  const set = <K extends keyof IntakeFormValues>(key: K, value: IntakeFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const setDate = (key: DateKey, next: DateAnswer) =>
    setValues((prev) => ({ ...prev, dates: { ...prev.dates, [key]: next } }));

  /** Clears answers whose question is no longer visible, so nothing stale is submitted. */
  const pruneHidden = (v: IntakeFormValues): IntakeFormValues => {
    const next: IntakeFormValues = {
      ...v,
      dates: { ...v.dates },
    };
    if (!showLetterWords(v)) next.letterWords = "";
    if (!showDetentionQuestions(v)) {
      next.currentlyDetained = "";
      next.removalDateGiven = "";
    }
    if (!showLetterDeadlineQuestion(v)) next.letterDeadlineStated = "";
    if (!showVisaExpiryDate(v)) next.dates.visaExpiry = { ...emptyDateAnswer };
    if (!showHearingDate(v)) next.dates.hearing = { ...emptyDateAnswer };
    if (!showRemovalDate(v)) next.dates.removal = { ...emptyDateAnswer };
    if (!showStatedDeadlineDate(v)) next.dates.statedDeadline = { ...emptyDateAnswer };
    if (!showLetterDeadlineDate(v)) next.dates.letterDeadline = { ...emptyDateAnswer };
    return next;
  };

  const validate = (v: IntakeFormValues): FieldErrors => {
    const found: FieldErrors = {};
    const parsed = detailsSchema.safeParse(v);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!found[key]) found[key] = issue.message;
      }
    }
    if (!v.category) found["category"] = "Select the option that best describes your enquiry";
    if (!v.location) found["location"] = "Select where you are currently";
    if (v.urgency.length === 0)
      found["urgency"] = "Select at least one option, or choose “None of these”";
    if (showLetterWords(v) && !v.letterWords) found["letterWords"] = "Select an option";
    if (showDetentionQuestions(v)) {
      if (!v.currentlyDetained) found["currentlyDetained"] = "Select an option";
      if (!v.removalDateGiven) found["removalDateGiven"] = "Select an option";
    }
    if (showLetterDeadlineQuestion(v) && !v.letterDeadlineStated)
      found["letterDeadlineStated"] = "Select an option";
    if (!v.existingRepresentative) found["existingRepresentative"] = "Select an option";

    const dateChecks: [DateKey, boolean][] = [
      ["visaExpiry", showVisaExpiryDate(v)],
      ["hearing", showHearingDate(v)],
      ["removal", showRemovalDate(v)],
      ["statedDeadline", showStatedDeadlineDate(v)],
      ["letterDeadline", showLetterDeadlineDate(v)],
    ];
    for (const [key, visible] of dateChecks) {
      if (!visible) continue;
      const answer = v.dates[key];
      if (!answer.knowsExact) {
        found[`dates.${key}`] = "Select an option";
        continue;
      }
      if (answer.knowsExact !== "yes") continue;
      if (!answer.date) {
        found[`dates.${key}`] = "Enter the date";
        continue;
      }
      if (!isValidDateString(answer.date)) {
        found[`dates.${key}`] = "Enter a valid date";
        continue;
      }
      if (isBeforeToday(answer.date) && answer.pastConfirmed !== "yes") {
        found[`dates.${key}`] = "Confirm whether the past date you entered is correct";
      }
    }
    return found;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError("");

    const cleaned = pruneHidden(values);
    setValues(cleaned);
    const found = validate(cleaned);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const firstError = document.querySelector("[role='alert']");
      firstError?.scrollIntoView({ block: "center" });
      return;
    }

    if (!turnstileToken) {
      setSubmissionError("Complete the human verification before submitting.");
      return;
    }

    const payload = toCanonicalSubmission(cleaned, {
      privacyNoticeVersion: FIRM.privacyNoticeVersion,
      privacyNoticeUrl: FIRM.privacyPolicyUrl,
      privacyNoticeDisplayedAt,
      website,
    });

    setSubmitting(true);
    try {
      const response = await fetch(`/api/intake/${encodeURIComponent(publishedFormId)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-turnstile-token": turnstileToken,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        navigate({ to: "/intake/$publishedFormId/submitted", params: { publishedFormId } });
        return;
      }

      setTurnstileResetKey((value) => value + 1);
      if (response.status === 403) {
        setSubmissionError("Human verification expired or was not accepted. Please try again.");
      } else if (response.status === 404) {
        setSubmissionError("This enquiry form is not currently available.");
      } else if (response.status === 422) {
        setSubmissionError("Some information could not be accepted. Review the form and try again.");
      } else if (response.status === 429) {
        setSubmissionError("Too many submission attempts. Please wait before trying again.");
      } else if (response.status === 503) {
        setSubmissionError("Submission is temporarily unavailable. Please try again later.");
      } else {
        setSubmissionError("The enquiry could not be submitted. Please try again.");
      }
    } catch {
      setTurnstileResetKey((value) => value + 1);
      setSubmissionError("The enquiry could not be submitted. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IntakeShell publishedFormId={publishedFormId}>
      <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
        Immigration enquiry form
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Please answer as fully as you can. Fields marked optional can be left blank.
      </p>
      <p className="mt-3 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground">
        Fictional demo only — do not enter real client or case information.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
        <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            autoComplete="off"
            tabIndex={-1}
          />
        </div>

        <SectionCard step="Section 1" title="Privacy">
          <div className="space-y-3 text-sm leading-relaxed text-foreground">
            <p>
              This enquiry form is provided by <strong>{FIRM.name}</strong>.
            </p>
            <p>
              <a
                href={FIRM.privacyPolicyUrl}
                className="font-medium underline underline-offset-4"
              >
                Privacy Notice
              </a>{" "}
              <span className="text-muted-foreground">(placeholder link)</span>
            </p>
            <p className="rounded-md border border-border bg-surface px-4 py-3 text-muted-foreground">
              {AUTOMATED_RULES_STATEMENT}
            </p>
          </div>
        </SectionCard>

        <SectionCard step="Section 2" title="Your details">
          <TextField
            label="Full name"
            value={values.fullName}
            onChange={(v) => set("fullName", v)}
            error={errors["fullName"]}
            maxLength={150}
            autoComplete="name"
          />
          <TextField
            label="Email"
            type="email"
            value={values.email}
            onChange={(v) => set("email", v)}
            error={errors["email"]}
            maxLength={254}
            autoComplete="email"
          />
          <TextField
            label="Phone"
            type="tel"
            value={values.phone}
            onChange={(v) => set("phone", v)}
            error={errors["phone"]}
            maxLength={20}
            autoComplete="tel"
          />
          <RadioGroupField
            legend="Preferred contact method"
            options={CONTACT_METHODS}
            value={values.contactMethod}
            onChange={(v) => set("contactMethod", v)}
            error={errors["contactMethod"]}
            columns={2}
          />
          <RadioGroupField
            legend="Preferred contact time (optional)"
            options={CONTACT_TIMES}
            value={values.contactTime}
            onChange={(v) => set("contactTime", v)}
            error={errors["contactTime"]}
            columns={2}
          />
        </SectionCard>

        <SectionCard step="Section 3" title="What best describes your enquiry?">
          <RadioGroupField
            legend="Select the closest option"
            options={CATEGORIES}
            value={values.category}
            onChange={(v) => set("category", v)}
            error={errors["category"]}
          />

          {showLetterWords(values) ? (
            <RadioGroupField
              legend="Does the letter itself mention any of these words?"
              options={LETTER_WORDS}
              value={values.letterWords}
              onChange={(v) => set("letterWords", v)}
              error={errors["letterWords"]}
              columns={2}
            />
          ) : null}

          {showDetentionQuestions(values) ? (
            <>
              <RadioGroupField
                legend="Are you currently detained?"
                options={YES_NO_NOT_SURE}
                value={values.currentlyDetained}
                onChange={(v) => set("currentlyDetained", v)}
                error={errors["currentlyDetained"]}
                columns={2}
              />
              <RadioGroupField
                legend="Have you been given a removal/deportation date?"
                options={YES_NO_NOT_SURE}
                value={values.removalDateGiven}
                onChange={(v) => set("removalDateGiven", v)}
                error={errors["removalDateGiven"]}
                columns={2}
              />
            </>
          ) : null}
        </SectionCard>

        <SectionCard step="Section 4" title="Location">
          <RadioGroupField
            legend="Where are you currently?"
            options={LOCATIONS}
            value={values.location}
            onChange={(v) => set("location", v)}
            error={errors["location"]}
          />
        </SectionCard>

        <SectionCard step="Section 5" title="Urgency facts">
          <CheckboxGroupField
            legend="Please tell us if any of the following apply."
            hint="Select all that apply."
            options={URGENCY_OPTIONS}
            values={values.urgency}
            isDisabled={(option) => isUrgencyOptionDisabled(values.urgency, option)}
            onToggle={(option, checked) =>
              set("urgency", nextUrgencySelection(values.urgency, option, checked))
            }
            error={errors["urgency"]}
          />

          {showVisaExpiryDate(values) ? (
            <KnownDateField
              legend="Your visa/permission expiry — do you know the exact date?"
              value={values.dates.visaExpiry}
              onChange={(next) => setDate("visaExpiry", next)}
              error={errors["dates.visaExpiry"]}
            />
          ) : null}

          {showHearingDate(values) ? (
            <KnownDateField
              legend="Your hearing date — do you know the exact date?"
              value={values.dates.hearing}
              onChange={(next) => setDate("hearing", next)}
              error={errors["dates.hearing"]}
            />
          ) : null}

          {showRemovalDate(values) ? (
            <KnownDateField
              legend="Your removal/deportation date — do you know the exact date?"
              value={values.dates.removal}
              onChange={(next) => setDate("removal", next)}
              error={errors["dates.removal"]}
            />
          ) : null}

          {showStatedDeadlineDate(values) ? (
            <KnownDateField
              legend="The deadline you have been given — do you know the exact date?"
              value={values.dates.statedDeadline}
              onChange={(next) => setDate("statedDeadline", next)}
              error={errors["dates.statedDeadline"]}
            />
          ) : null}

          {showLetterDeadlineQuestion(values) ? (
            <RadioGroupField
              legend="Does your letter state a response deadline?"
              options={LETTER_DEADLINE_OPTIONS}
              value={values.letterDeadlineStated}
              onChange={(v) => set("letterDeadlineStated", v)}
              error={errors["letterDeadlineStated"]}
            />
          ) : null}

          {showLetterDeadlineDate(values) ? (
            <KnownDateField
              legend="The deadline stated in your letter — do you know the exact date?"
              value={values.dates.letterDeadline}
              onChange={(next) => setDate("letterDeadline", next)}
              error={errors["dates.letterDeadline"]}
            />
          ) : null}
        </SectionCard>

        <SectionCard
          step="Section 6"
          title="Conflict-check information"
          description="Please do not provide detailed case facts or upload documents at this stage. We only need enough information to carry out our initial checks."
        >
          <TextField
            label="Previous names"
            value={values.previousNames}
            onChange={(v) => set("previousNames", v)}
            maxLength={200}
            optional
          />
          <TextField
            label="Spouse/partner name"
            value={values.partnerName}
            onChange={(v) => set("partnerName", v)}
            maxLength={200}
            optional
          />
          <TextField
            label="Sponsoring employer"
            value={values.sponsoringEmployer}
            onChange={(v) => set("sponsoringEmployer", v)}
            maxLength={200}
            optional
          />
          <RadioGroupField
            legend="Existing representative"
            options={EXISTING_REP_OPTIONS}
            value={values.existingRepresentative}
            onChange={(v) => set("existingRepresentative", v)}
            error={errors["existingRepresentative"]}
            columns={2}
          />
        </SectionCard>

        <SectionCard step="Final check" title="Human verification">
          <TurnstileField onTokenChange={setTurnstileToken} resetKey={turnstileResetKey} />
        </SectionCard>

        {submissionError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm text-destructive"
          >
            {submissionError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Fictional demo only — do not enter real client information.
          </p>
          <button
            type="submit"
            disabled={submitting || !turnstileToken}
            className="h-11 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit enquiry"}
          </button>
        </div>
      </form>
    </IntakeShell>
  );
}

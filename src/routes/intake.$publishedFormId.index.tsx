import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckboxGroupField } from "@/components/intake/CheckboxGroupField";
import { IntakeShell } from "@/components/intake/IntakeShell";
import { KnownDateField } from "@/components/intake/KnownDateField";
import { RadioGroupField } from "@/components/intake/RadioGroupField";
import { SectionCard } from "@/components/intake/SectionCard";
import { TextField } from "@/components/intake/TextField";
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
    ],
  }),
  component: IntakeForm,
});

/**
 * Frontend responsibilities only: field display, conditional visibility,
 * basic UX validation and mock navigation. No priority, routing, deadline
 * calculation or legal interpretation happens here.
 */
function IntakeForm() {
  const { publishedFormId } = Route.useParams();
  const navigate = useNavigate();
  const [values, setValues] = useState<IntakeFormValues>(emptyIntakeForm);
  const [errors, setErrors] = useState<FieldErrors>({});

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
      if (!answer.knowsExact) found[`dates.${key}`] = "Select an option";
      else if (answer.knowsExact === "yes" && !answer.date)
        found[`dates.${key}`] = "Enter the date";
    }
    return found;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pruneHidden(values);
    setValues(cleaned);
    const found = validate(cleaned);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const firstError = document.querySelector("[role='alert']");
      firstError?.scrollIntoView({ block: "center" });
      return;
    }
    // Local/mock submission only — nothing is stored or sent anywhere.
    navigate({ to: "/intake/$publishedFormId/submitted", params: { publishedFormId } });
  };

  return (
    <IntakeShell publishedFormId={publishedFormId}>
      <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
        Immigration enquiry form
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Please answer as fully as you can. Fields marked optional can be left blank.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
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
            maxLength={120}
            autoComplete="name"
          />
          <TextField
            label="Email"
            type="email"
            value={values.email}
            onChange={(v) => set("email", v)}
            error={errors["email"]}
            maxLength={200}
            autoComplete="email"
          />
          <TextField
            label="Phone"
            type="tel"
            value={values.phone}
            onChange={(v) => set("phone", v)}
            error={errors["phone"]}
            maxLength={40}
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
            legend="Preferred contact time"
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
            columns={2}
          />
        </SectionCard>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Prototype form — submissions are not stored or sent.
          </p>
          <button
            type="submit"
            className="h-11 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Submit enquiry
          </button>
        </div>
      </form>
    </IntakeShell>
  );
}

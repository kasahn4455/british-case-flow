import { useId, useRef } from "react";
import { KNOWS_DATE_OPTIONS } from "@/lib/intake/options";
import { isBeforeToday, type DateAnswer } from "@/lib/intake/schema";
import { RadioGroupField } from "./RadioGroupField";

/**
 * Shared exact-date flow.
 *
 * 1. "Do you know the exact date?"
 * 2. Only on "Yes" does the date input appear.
 * 3. A date earlier than today triggers a data-entry confirmation prompt.
 *
 * This is UX validation only. Nothing here states or infers that a legal
 * deadline has passed, expired, or been missed.
 */
export function KnownDateField({
  legend,
  value,
  onChange,
  error,
}: {
  legend: string;
  value: DateAnswer;
  onChange: (next: DateAnswer) => void;
  error?: string | undefined;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const showInput = value.knowsExact === "yes";
  const showPastPrompt = showInput && value.date !== "" && isBeforeToday(value.date);

  return (
    <div className="rounded-md border border-border bg-surface px-4 py-4">
      <RadioGroupField
        legend={legend}
        options={KNOWS_DATE_OPTIONS}
        value={value.knowsExact}
        columns={2}
        onChange={(next) =>
          onChange(
            next === "yes"
              ? { ...value, knowsExact: next }
              : { knowsExact: next, date: "", pastConfirmed: "" },
          )
        }
      />

      {showInput ? (
        <div className="mt-4">
          <label htmlFor={id} className="text-sm font-semibold text-foreground">
            Date
          </label>
          <input
            id={id}
            ref={inputRef}
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value, pastConfirmed: "" })}
            aria-invalid={error ? true : undefined}
            className={`mt-2 block h-11 w-full max-w-xs rounded-md border bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 ${
              error ? "border-destructive" : "border-input"
            }`}
          />
          {error ? (
            <p role="alert" className="mt-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {showPastPrompt ? (
        <div className="mt-4 rounded-md border border-border bg-card px-4 py-4">
          <RadioGroupField
            legend="The date you entered has already passed. Is this the date you intended to enter?"
            options={[
              { value: "yes", label: "Yes, that's correct" },
              { value: "no", label: "No, let me fix it" },
            ]}
            value={value.pastConfirmed}
            columns={2}
            onChange={(next) => {
              if (next === "no") {
                onChange({ ...value, date: "", pastConfirmed: "" });
                window.requestAnimationFrame(() => inputRef.current?.focus());
                return;
              }
              onChange({ ...value, pastConfirmed: next });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

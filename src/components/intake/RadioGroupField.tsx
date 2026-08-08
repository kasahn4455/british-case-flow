import { useId } from "react";
import type { Option } from "@/lib/intake/options";

export function RadioGroupField({
  legend,
  hint,
  options,
  value,
  onChange,
  error,
  columns = 1,
}: {
  legend: string;
  hint?: string | undefined;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  columns?: (1 | 2) | undefined;
}) {
  const name = useId();
  const errorId = `${name}-error`;

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-foreground">{legend}</legend>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div
        className={`mt-3 grid gap-2 ${columns === 2 ? "sm:grid-cols-2" : ""}`}
        aria-describedby={error ? errorId : undefined}
      >
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                checked
                  ? "border-primary bg-secondary text-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <span className="leading-snug">{option.label}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

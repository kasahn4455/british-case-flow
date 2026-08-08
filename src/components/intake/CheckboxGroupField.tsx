import { useId } from "react";
import type { Option } from "@/lib/intake/options";

export function CheckboxGroupField({
  legend,
  hint,
  options,
  values,
  onToggle,
  isDisabled,
  error,
}: {
  legend: string;
  hint?: string;
  options: Option[];
  values: string[];
  onToggle: (value: string, checked: boolean) => void;
  isDisabled?: (value: string) => boolean;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-foreground">{legend}</legend>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-3 grid gap-2" aria-describedby={error ? errorId : undefined}>
        {options.map((option) => {
          const checked = values.includes(option.value);
          const disabled = !checked && (isDisabled?.(option.value) ?? false);
          return (
            <label
              key={option.value}
              className={`flex min-h-11 items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                disabled
                  ? "cursor-not-allowed border-border bg-muted/60 text-muted-foreground"
                  : checked
                    ? "cursor-pointer border-primary bg-secondary text-foreground"
                    : "cursor-pointer border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onToggle(option.value, e.target.checked)}
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

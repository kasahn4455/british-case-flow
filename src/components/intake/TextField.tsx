import { useId } from "react";

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  error,
  maxLength,
  autoComplete,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "tel";
  hint?: string;
  error?: string;
  maxLength?: number;
  autoComplete?: string;
  optional?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {optional ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        className={`mt-2 block h-11 w-full rounded-md border bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 ${
          error ? "border-destructive" : "border-input"
        }`}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

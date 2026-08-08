import type { ReactNode } from "react";

export function SectionCard({
  step,
  title,
  description,
  children,
}: {
  step?: string | undefined;
  title: string;
  description?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="border-b border-border px-5 py-4 sm:px-7 sm:py-5">
        {step ? (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {step}
          </p>
        ) : null}
        <h2 className="mt-1 text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
        {description ? (
          <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </header>
      <div className="space-y-7 px-5 py-6 sm:px-7 sm:py-7">{children}</div>
    </section>
  );
}

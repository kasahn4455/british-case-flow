import type { ReactNode } from "react";

export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-3 last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

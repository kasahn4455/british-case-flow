import type { ReactNode } from "react";
import { FIRM } from "@/lib/mock/firm";

export function IntakeShell({
  publishedFormId,
  children,
}: {
  publishedFormId: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 px-5 py-5 sm:px-8 sm:py-6">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Enquiry form
          </span>
          <span className="font-serif text-xl font-semibold text-foreground sm:text-2xl">
            {FIRM.name}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-5 py-6 text-xs leading-relaxed text-muted-foreground sm:px-8">
          <p>
            {FIRM.name} · {FIRM.address} · {FIRM.phone}
          </p>
          <p className="mt-1">
            Form reference {publishedFormId} · {FIRM.regulatoryNote}
          </p>
        </div>
      </footer>
    </div>
  );
}

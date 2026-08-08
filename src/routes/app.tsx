import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { DEMO_MODE_LABEL, FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: StaffLayout,
});

const NAV = [
  { to: "/app/enquiries", label: "Enquiries" },
  { to: "/app/settings", label: "Firm settings" },
] as const;

function StaffLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground">
        {DEMO_MODE_LABEL}
      </div>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-serif text-lg font-semibold text-foreground">{FIRM.shortName}</p>
            <p className="text-xs text-muted-foreground">Enquiry intake workspace</p>
          </div>
          <nav aria-label="Primary" className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Sign out
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

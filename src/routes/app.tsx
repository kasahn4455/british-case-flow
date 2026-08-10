import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { StaffSignOutButton } from "@/components/staff/StaffSignOutButton";
import { getStaffAuthState } from "@/lib/auth/staff-auth.functions";
import { getStaffDestination } from "@/lib/auth/staff-auth-state";
import { DEMO_MODE_LABEL, FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  loader: async () => {
    const state = await getStaffAuthState();
    const destination = getStaffDestination(state);
    if (destination === "/login") throw redirect({ to: "/login" });
    if (destination === "/mfa/setup") throw redirect({ to: "/mfa/setup" });
    if (destination === "/mfa/challenge") throw redirect({ to: "/mfa/challenge" });
    return state;
  },
  component: StaffLayout,
});

const NAV = [
  { to: "/app/enquiries", label: "Enquiries" },
  { to: "/app/settings", label: "Firm settings" },
] as const;

function StaffLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const authState = Route.useLoaderData();
  const staff = authState.kind === "staff" ? authState : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground">
        {DEMO_MODE_LABEL} · authenticated staff workspace
      </div>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-serif text-lg font-semibold text-foreground">{FIRM.shortName}</p>
            <p className="text-xs text-muted-foreground">Enquiry intake workspace</p>
            {staff ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {staff.email ?? "Staff account"} · {staff.role} · MFA verified
              </p>
            ) : null}
          </div>
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">
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
            <StaffSignOutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { TextField } from "@/components/intake/TextField";
import { DEMO_MODE_LABEL, FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: `Staff sign in — ${FIRM.shortName}` },
      {
        name: "description",
        content: "Placeholder staff sign-in screen for the enquiry intake prototype. No authentication is implemented.",
      },
      { property: "og:title", content: `Staff sign in — ${FIRM.shortName}` },
      {
        property: "og:description",
        content: "Placeholder staff sign-in screen for the enquiry intake prototype.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-md border border-border bg-card px-6 py-7 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {FIRM.shortName}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-foreground">Staff sign in</h1>
          <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground">
            {DEMO_MODE_LABEL} · authentication is not implemented in this phase.
          </p>

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/app/enquiries" });
            }}
          >
            <TextField
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
            />
            <div>
              <label htmlFor="password" className="text-sm font-semibold text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
            <button
              type="submit"
              className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Continue to workspace
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{FIRM.regulatoryNote}</p>
      </div>
    </div>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function StaffSignOutButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const supabase = createSupabaseBrowserClient();
            const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
            if (signOutError) {
              setError("Sign out failed. Try again.");
              return;
            }
            navigate({ to: "/login" });
          } catch (caught) {
            console.error(caught);
            setError("Sign out failed. Try again.");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readStaffAuthState } from "@/lib/auth/staff-auth.server";
import { applyBrokeredPriorityOverride } from "./priority-override.server";

const overrideInputSchema = z.object({
  enquiryId: z.string().uuid(),
  newPriority: z.enum(["CRITICAL", "URGENT", "PRIORITY", "MANUAL_REVIEW", "ROUTINE"]),
  reason: z.string().trim().min(10).max(1000),
});

/**
 * Staff mutation boundary. This is intentionally a TanStack server function so
 * the app's same-origin CSRF middleware applies before any service-role RPC call.
 * The actor UUID is always derived from the verified Supabase session; it is never
 * accepted from browser input.
 */
export const overrideEnquiryPriority = createServerFn({ method: "POST" })
  .validator(overrideInputSchema)
  .handler(async ({ data }) => {
    const authState = await readStaffAuthState();
    if (
      authState.kind !== "staff" ||
      authState.currentLevel !== "aal2" ||
      authState.nextLevel !== "aal2"
    ) {
      throw new Error("A verified AAL2 staff session is required");
    }

    return applyBrokeredPriorityOverride({
      enquiryId: data.enquiryId,
      newPriority: data.newPriority,
      reason: data.reason,
      actorUserId: authState.userId,
    });
  });

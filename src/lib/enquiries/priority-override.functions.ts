import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readStaffAuthState } from "@/lib/auth/staff-auth.server";
import { resolveEnquiryIdForFirm } from "./live-enquiries.server";
import { applyBrokeredPriorityOverride } from "./priority-override.server";

const overrideInputSchema = z.object({
  publicReference: z.string().trim().min(1).max(120),
  newPriority: z.enum(["CRITICAL", "URGENT", "PRIORITY", "MANUAL_REVIEW", "ROUTINE"]),
  reason: z.string().trim().min(10).max(1000),
});

/**
 * Staff mutation boundary. This is intentionally a TanStack server function so
 * the app's same-origin CSRF middleware applies before any service-role RPC call.
 * Browser input contains only the public reference; tenant scoping resolves the
 * internal enquiry UUID and the actor UUID always comes from the verified session.
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

    const enquiryId = await resolveEnquiryIdForFirm(authState.firmId, data.publicReference);
    if (!enquiryId) throw new Error("Enquiry not found");

    return applyBrokeredPriorityOverride({
      enquiryId,
      newPriority: data.newPriority,
      reason: data.reason,
      actorUserId: authState.userId,
    });
  });

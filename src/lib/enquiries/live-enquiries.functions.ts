import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readStaffAuthState } from "@/lib/auth/staff-auth.server";
import { readEnquiryDetailForFirm, readEnquiryQueueForFirm } from "./live-enquiries.server";

function requireAal2StaffFirmId(state: Awaited<ReturnType<typeof readStaffAuthState>>): string {
  if (state.kind !== "staff" || state.currentLevel !== "aal2" || state.nextLevel !== "aal2") {
    throw new Error("A verified AAL2 staff session is required");
  }
  return state.firmId;
}

/** Server-only dashboard read. RLS remains authoritative; firmId is also applied explicitly. */
export const getLiveEnquiryQueue = createServerFn({ method: "GET" }).handler(async () => {
  const authState = await readStaffAuthState();
  return readEnquiryQueueForFirm(requireAal2StaffFirmId(authState));
});

const detailInputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
});

/** Returns null for missing or cross-tenant references to avoid tenant enumeration. */
export const getLiveEnquiryDetail = createServerFn({ method: "GET" })
  .validator(detailInputSchema)
  .handler(async ({ data }) => {
    const authState = await readStaffAuthState();
    return readEnquiryDetailForFirm(requireAal2StaffFirmId(authState), data.reference);
  });

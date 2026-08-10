import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readStaffAuthState } from "@/lib/auth/staff-auth.server";
import { applyContactLog, applyStaffAssignment, applyStatusChange } from "./staff-actions.server";

const publicReferenceSchema = z.string().trim().min(1).max(120);

function requireAal2Staff(state: Awaited<ReturnType<typeof readStaffAuthState>>) {
  if (
    state.kind !== "staff" ||
    state.currentLevel !== "aal2" ||
    state.nextLevel !== "aal2"
  ) {
    throw new Error("A verified AAL2 staff session is required");
  }
  return state;
}

export const assignEnquiryToSelf = createServerFn({ method: "POST" })
  .validator(z.object({ publicReference: publicReferenceSchema }))
  .handler(async ({ data }) => {
    const staff = requireAal2Staff(await readStaffAuthState());
    return applyStaffAssignment({
      publicReference: data.publicReference,
      actorUserId: staff.userId,
      assignToSelf: true,
    });
  });

export const unassignEnquiry = createServerFn({ method: "POST" })
  .validator(z.object({ publicReference: publicReferenceSchema }))
  .handler(async ({ data }) => {
    const staff = requireAal2Staff(await readStaffAuthState());
    return applyStaffAssignment({
      publicReference: data.publicReference,
      actorUserId: staff.userId,
      assignToSelf: false,
    });
  });

export const changeEnquiryStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({
      publicReference: publicReferenceSchema,
      newStatus: z.enum(["NEW", "IN_REVIEW", "CONTACTED", "AWAITING_CLIENT", "CLOSED"]),
    }),
  )
  .handler(async ({ data }) => {
    const staff = requireAal2Staff(await readStaffAuthState());
    return applyStatusChange({
      publicReference: data.publicReference,
      actorUserId: staff.userId,
      newStatus: data.newStatus,
    });
  });

export const logEnquiryContact = createServerFn({ method: "POST" })
  .validator(
    z.object({
      publicReference: publicReferenceSchema,
      channel: z.enum(["PHONE", "EMAIL", "SMS", "OTHER"]),
      direction: z.enum(["INBOUND", "OUTBOUND"]),
      outcome: z.string().trim().min(1).max(200),
      notes: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const staff = requireAal2Staff(await readStaffAuthState());
    return applyContactLog({
      publicReference: data.publicReference,
      actorUserId: staff.userId,
      channel: data.channel,
      direction: data.direction,
      outcome: data.outcome,
      ...(data.notes ? { notes: data.notes } : {}),
    });
  });

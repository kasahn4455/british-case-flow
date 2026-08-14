import { createServerFn } from "@tanstack/react-start";

import { readStaffAuthState } from "@/lib/auth/staff-auth.server";
import { processOutboxBatchForFirm } from "@/server/outbox-worker/process";

export const processFirmOutboxNow = createServerFn({ method: "POST" }).handler(async () => {
  const state = await readStaffAuthState();
  if (
    state.kind !== "staff" ||
    state.currentLevel !== "aal2" ||
    state.nextLevel !== "aal2" ||
    state.role !== "admin"
  ) {
    throw new Error("An MFA-verified admin session is required");
  }

  return processOutboxBatchForFirm(state.firmId, 25);
});

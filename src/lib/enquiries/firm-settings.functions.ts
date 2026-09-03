import { createServerFn } from "@tanstack/react-start";

import { readStaffAuthState } from "@/lib/auth/staff-auth.server";
import { readFirmSettingsOverview } from "./firm-settings.server";

export const getFirmSettingsOverview = createServerFn({ method: "GET" }).handler(async () => {
  const state = await readStaffAuthState();
  if (state.kind !== "staff" || state.currentLevel !== "aal2" || state.nextLevel !== "aal2") {
    throw new Error("A verified AAL2 staff session is required");
  }

  const overview = await readFirmSettingsOverview(state.firmId);
  return {
    publishedForm: overview.publishedForm,
    notificationHealth: state.role === "admin" ? overview.notificationHealth : null,
  };
});

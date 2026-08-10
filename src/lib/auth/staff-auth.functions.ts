import { createServerFn } from "@tanstack/react-start";

import { readStaffAuthState } from "./staff-auth.server";

export const getStaffAuthState = createServerFn({ method: "GET" }).handler(() =>
  readStaffAuthState(),
);

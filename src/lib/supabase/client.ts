import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY } from "./public-config";

export class StaffAuthConfigurationError extends Error {
  constructor() {
    super("Staff authentication is not configured");
    this.name = "StaffAuthConfigurationError";
  }
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY);
}

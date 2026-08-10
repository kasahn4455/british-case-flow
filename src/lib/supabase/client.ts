/// <reference types="vite/types/importMeta.d.ts" />

import { createBrowserClient } from "@supabase/ssr";

export class StaffAuthConfigurationError extends Error {
  constructor() {
    super("Staff authentication is not configured");
    this.name = "StaffAuthConfigurationError";
  }
}

export function createSupabaseBrowserClient() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !publishableKey) throw new StaffAuthConfigurationError();
  return createBrowserClient(url, publishableKey);
}

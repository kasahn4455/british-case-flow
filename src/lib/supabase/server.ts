import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie, setResponseHeader } from "@tanstack/react-start/server";

import { SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY } from "./public-config";

export class StaffAuthServerConfigurationError extends Error {
  constructor() {
    super("Staff authentication is not configured");
    this.name = "StaffAuthServerConfigurationError";
  }
}

export function createSupabaseServerClient() {
  return createServerClient(SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookies, headers) {
        cookies.forEach(({ name, value, options }) => setCookie(name, value, options));
        Object.entries(headers).forEach(([name, value]) => setResponseHeader(name, value));
      },
    },
  });
}

import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie, setResponseHeader } from "@tanstack/react-start/server";

export class StaffAuthServerConfigurationError extends Error {
  constructor() {
    super("Staff authentication is not configured");
    this.name = "StaffAuthServerConfigurationError";
  }
}

export function createSupabaseServerClient() {
  const url = process.env["VITE_SUPABASE_URL"];
  const publishableKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !publishableKey) throw new StaffAuthServerConfigurationError();

  return createServerClient(url, publishableKey, {
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

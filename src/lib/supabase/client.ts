import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY } from "./public-config";

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY);
}

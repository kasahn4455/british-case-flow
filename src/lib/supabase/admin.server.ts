import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const adminEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

export class SupabaseAdminConfigurationError extends Error {
  constructor() {
    super("Supabase admin access is not configured");
    this.name = "SupabaseAdminConfigurationError";
  }
}

function runtimeEnv(): Record<string, string | undefined> {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};
}

export function createSupabaseAdminClient() {
  const parsed = adminEnvSchema.safeParse(runtimeEnv());
  if (!parsed.success) throw new SupabaseAdminConfigurationError();

  return createClient(parsed.data.SUPABASE_URL, parsed.data.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

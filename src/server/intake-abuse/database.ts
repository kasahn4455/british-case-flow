import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const rateLimitResultSchema = z.object({
  form_available: z.boolean(),
  allowed: z.boolean(),
  retry_after_seconds: z.number().int().nonnegative(),
});

export class AbuseDatabaseConfigurationError extends Error {
  constructor() {
    super("Abuse-control database is not configured");
    this.name = "AbuseDatabaseConfigurationError";
  }
}

export class AbuseDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbuseDatabaseError";
  }
}

function getDatabaseEnv() {
  const runtimeEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {};
  const parsed = envSchema.safeParse(runtimeEnv);
  if (!parsed.success) throw new AbuseDatabaseConfigurationError();
  return parsed.data;
}

export async function checkIntakeRateLimits(args: {
  publishedFormId: string;
  ipHash: string;
  sessionHash: string;
  now?: Date;
}) {
  const env = getDatabaseEnv();
  const url = new URL("/rest/v1/rpc/check_intake_rate_limits_v1", env.SUPABASE_URL);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "content-type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        p_published_form_id: args.publishedFormId,
        p_ip_hash: args.ipHash,
        p_session_hash: args.sessionHash,
        p_now: (args.now ?? new Date()).toISOString(),
      }),
    });
  } catch {
    throw new AbuseDatabaseError("Rate-limit database request failed");
  }

  if (!response.ok) {
    throw new AbuseDatabaseError(`Rate-limit RPC failed with status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new AbuseDatabaseError("Rate-limit RPC returned an invalid response");
  }

  const first = Array.isArray(payload) ? payload[0] : payload;
  const parsed = rateLimitResultSchema.safeParse(first);
  if (!parsed.success) throw new AbuseDatabaseError("Rate-limit RPC returned an invalid response");
  return parsed.data;
}

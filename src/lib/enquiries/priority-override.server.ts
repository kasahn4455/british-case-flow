import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const prioritySchema = z.enum(["CRITICAL", "URGENT", "PRIORITY", "MANUAL_REVIEW", "ROUTINE"]);

const responseSchema = z.object({
  id: z.string().uuid(),
  priority: prioritySchema,
  priority_reason: z.string(),
  updated_at: z.string(),
});

export type PriorityOverrideResult = z.infer<typeof responseSchema>;

export class PriorityOverrideConfigurationError extends Error {
  constructor() {
    super("Priority override backend is not configured");
    this.name = "PriorityOverrideConfigurationError";
  }
}

export class PriorityOverridePersistenceError extends Error {
  constructor() {
    super("Priority override could not be applied");
    this.name = "PriorityOverridePersistenceError";
  }
}

function getBackendEnv() {
  const runtimeEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {};
  const parsed = envSchema.safeParse(runtimeEnv);
  if (!parsed.success) throw new PriorityOverrideConfigurationError();
  return parsed.data;
}

export async function applyBrokeredPriorityOverride(args: {
  enquiryId: string;
  newPriority: z.infer<typeof prioritySchema>;
  reason: string;
  actorUserId: string;
}): Promise<PriorityOverrideResult> {
  const env = getBackendEnv();
  const url = new URL("/rest/v1/rpc/override_enquiry_priority", env.SUPABASE_URL);

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_enquiry_id: args.enquiryId,
      p_new_priority: args.newPriority,
      p_reason: args.reason,
      p_actor_user_id: args.actorUserId,
    }),
  });

  if (!response.ok) throw new PriorityOverridePersistenceError();

  const raw = (await response.json()) as unknown;
  const normalized = Array.isArray(raw) ? raw[0] : raw;
  const parsed = responseSchema.safeParse(normalized);
  if (!parsed.success) throw new PriorityOverridePersistenceError();

  return parsed.data;
}

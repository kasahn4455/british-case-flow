import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const claimedEventSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum(["ENQUIRY_INTERNAL_ALERT", "PROSPECT_ACKNOWLEDGEMENT"]),
  idempotency_key: z.string().min(1),
  payload: z.unknown(),
  retry_count: z.number().int().nonnegative(),
  created_at: z.string(),
});

const claimedEventsSchema = z.array(claimedEventSchema);
const cleanupSchema = z.object({
  rate_limit_windows_deleted: z.number().int().nonnegative(),
  security_event_retention_deferred: z.literal(true),
});

export type ClaimedOutboxEvent = z.infer<typeof claimedEventSchema>;
export type CleanupResult = z.infer<typeof cleanupSchema>;

export class OutboxDatabaseConfigurationError extends Error {
  constructor() {
    super("Outbox worker database is not configured");
    this.name = "OutboxDatabaseConfigurationError";
  }
}

export class OutboxDatabaseError extends Error {
  constructor() {
    super("Outbox worker database operation failed");
    this.name = "OutboxDatabaseError";
  }
}

function getEnv() {
  const runtimeEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {};
  const parsed = envSchema.safeParse(runtimeEnv);
  if (!parsed.success) throw new OutboxDatabaseConfigurationError();
  return parsed.data;
}

async function rpc(rpcName: string, body: Record<string, unknown>): Promise<unknown> {
  const env = getEnv();
  const response = await fetch(new URL(`/rest/v1/rpc/${rpcName}`, env.SUPABASE_URL), {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new OutboxDatabaseError();
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export async function claimOutboxEvents(
  workerId: string,
  limit = 25,
): Promise<ClaimedOutboxEvent[]> {
  const raw = await rpc("claim_outbox_events", {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 120,
  });
  const parsed = claimedEventsSchema.safeParse(raw);
  if (!parsed.success) throw new OutboxDatabaseError();
  return parsed.data;
}

export async function completeOutboxEvent(eventId: string, workerId: string): Promise<void> {
  await rpc("complete_outbox_event", {
    p_event_id: eventId,
    p_worker_id: workerId,
  });
}

export async function failOutboxEvent(eventId: string, workerId: string): Promise<void> {
  await rpc("fail_outbox_event", {
    p_event_id: eventId,
    p_worker_id: workerId,
    p_max_attempts: 8,
  });
}

export async function cleanupOperationalData(): Promise<CleanupResult> {
  const raw = await rpc("cleanup_intake_operational_data", {});
  const normalized = Array.isArray(raw) ? raw[0] : raw;
  const parsed = cleanupSchema.safeParse(normalized);
  if (!parsed.success) throw new OutboxDatabaseError();
  return parsed.data;
}

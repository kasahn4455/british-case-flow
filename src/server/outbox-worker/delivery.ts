import { z } from "zod";

import type { ClaimedOutboxEvent } from "./database";

const envSchema = z.object({
  OUTBOX_DELIVERY_WEBHOOK_URL: z.string().url(),
  OUTBOX_DELIVERY_WEBHOOK_TOKEN: z.string().min(20),
});

export class OutboxDeliveryConfigurationError extends Error {
  constructor() {
    super("Outbox delivery webhook is not configured");
    this.name = "OutboxDeliveryConfigurationError";
  }
}

export class OutboxDeliveryError extends Error {
  constructor() {
    super("Outbox event delivery failed");
    this.name = "OutboxDeliveryError";
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
  if (!parsed.success) throw new OutboxDeliveryConfigurationError();
  return parsed.data;
}

export function assertOutboxDeliveryConfigured(): void {
  getEnv();
}

export async function deliverOutboxEvent(event: ClaimedOutboxEvent): Promise<void> {
  const env = getEnv();
  const response = await fetch(env.OUTBOX_DELIVERY_WEBHOOK_URL, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${env.OUTBOX_DELIVERY_WEBHOOK_TOKEN}`,
      "content-type": "application/json",
      "idempotency-key": event.idempotency_key,
      "x-outbox-event-type": event.event_type,
    },
    body: JSON.stringify({
      eventId: event.event_id,
      eventType: event.event_type,
      idempotencyKey: event.idempotency_key,
      payload: event.payload,
      createdAt: event.created_at,
      attempt: event.retry_count,
    }),
  });

  if (!response.ok) throw new OutboxDeliveryError();
}

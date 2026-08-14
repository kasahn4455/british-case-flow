import {
  claimOutboxEvents,
  claimOutboxEventsForFirm,
  completeOutboxEvent,
  failOutboxEvent,
  type ClaimedOutboxEvent,
} from "./database";
import {
  assertOutboxDeliveryConfigured,
  deliverOutboxEvent,
  OutboxDeliveryError,
} from "./delivery";

export type OutboxBatchResult = {
  claimed: number;
  delivered: number;
  failed: number;
  failureCodes: string[];
};

function getFailureCode(error: unknown): string | null {
  if (!(error instanceof OutboxDeliveryError)) return null;

  const providerCode = error.providerCode?.trim();
  if (providerCode && providerCode !== "unknown" && providerCode !== "unparseable") {
    return providerCode;
  }
  if (error.providerStatus) return `http_${error.providerStatus}`;
  return "delivery_error";
}

async function processClaimedEvents(
  events: ClaimedOutboxEvent[],
  workerId: string,
): Promise<OutboxBatchResult> {
  let delivered = 0;
  let failed = 0;
  const failureCodes = new Set<string>();

  for (const event of events) {
    try {
      await deliverOutboxEvent(event);
      await completeOutboxEvent(event.event_id, workerId);
      delivered += 1;
    } catch (deliveryError) {
      const failureCode = getFailureCode(deliveryError);
      if (failureCode) failureCodes.add(failureCode);

      try {
        await failOutboxEvent(event.event_id, workerId);
      } catch (databaseError) {
        console.error(
          databaseError instanceof Error ? databaseError.message : "Outbox fail update error",
        );
      }
      failed += 1;
    }
  }

  return {
    claimed: events.length,
    delivered,
    failed,
    failureCodes: [...failureCodes].slice(0, 5),
  };
}

export async function processOutboxBatch(limit = 25): Promise<OutboxBatchResult> {
  assertOutboxDeliveryConfigured();
  const workerId = crypto.randomUUID();
  const events = await claimOutboxEvents(workerId, limit);
  return processClaimedEvents(events, workerId);
}

export async function processOutboxBatchForFirm(
  firmId: string,
  limit = 25,
): Promise<OutboxBatchResult> {
  assertOutboxDeliveryConfigured();
  const workerId = crypto.randomUUID();
  const events = await claimOutboxEventsForFirm(workerId, firmId, limit);
  return processClaimedEvents(events, workerId);
}

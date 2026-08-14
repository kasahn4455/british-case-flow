import {
  claimOutboxEvents,
  claimOutboxEventsForFirm,
  completeOutboxEvent,
  failOutboxEvent,
  type ClaimedOutboxEvent,
} from "./database";
import { assertOutboxDeliveryConfigured, deliverOutboxEvent } from "./delivery";

export type OutboxBatchResult = {
  claimed: number;
  delivered: number;
  failed: number;
};

async function processClaimedEvents(
  events: ClaimedOutboxEvent[],
  workerId: string,
): Promise<OutboxBatchResult> {
  let delivered = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await deliverOutboxEvent(event);
      await completeOutboxEvent(event.event_id, workerId);
      delivered += 1;
    } catch {
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

  return { claimed: events.length, delivered, failed };
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

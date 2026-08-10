import { createFileRoute } from "@tanstack/react-router";

import {
  claimOutboxEvents,
  completeOutboxEvent,
  failOutboxEvent,
  OutboxDatabaseConfigurationError,
  OutboxDatabaseError,
} from "@/server/outbox-worker/database";
import {
  assertOutboxDeliveryConfigured,
  deliverOutboxEvent,
  OutboxDeliveryConfigurationError,
} from "@/server/outbox-worker/delivery";
import {
  isAuthorizedWorkerRequest,
  WorkerAuthConfigurationError,
} from "@/server/outbox-worker/auth";

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/workers/outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await isAuthorizedWorkerRequest(request))) {
            return json({ error: "UNAUTHORIZED" }, 401);
          }

          // Fail before claiming rows if the downstream processor is unavailable by configuration.
          assertOutboxDeliveryConfigured();

          const workerId = crypto.randomUUID();
          const events = await claimOutboxEvents(workerId, 25);
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

          return json({ claimed: events.length, delivered, failed }, 200);
        } catch (error) {
          if (
            error instanceof WorkerAuthConfigurationError ||
            error instanceof OutboxDeliveryConfigurationError ||
            error instanceof OutboxDatabaseConfigurationError ||
            error instanceof OutboxDatabaseError
          ) {
            console.error(error.message);
            return json({ error: "WORKER_TEMPORARILY_UNAVAILABLE" }, 503);
          }

          console.error(error instanceof Error ? error.message : "Unexpected outbox worker error");
          return json({ error: "INTERNAL_ERROR" }, 500);
        }
      },
    },
  },
});

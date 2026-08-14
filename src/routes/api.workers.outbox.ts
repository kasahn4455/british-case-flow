import { createFileRoute } from "@tanstack/react-router";

import {
  OutboxDatabaseConfigurationError,
  OutboxDatabaseError,
} from "@/server/outbox-worker/database";
import { OutboxDeliveryConfigurationError } from "@/server/outbox-worker/delivery";
import { processOutboxBatch } from "@/server/outbox-worker/process";
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

          return json(await processOutboxBatch(25), 200);
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

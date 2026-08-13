import { createFileRoute } from "@tanstack/react-router";

import { prepareIntakeAbuseContext } from "@/server/intake-abuse/guard";

export const Route = createFileRoute("/api/smoke-prepare")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await prepareIntakeAbuseContext(request);
          return Response.json(
            { ok: true, stage: "PREPARE_OK" },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return Response.json(
            {
              ok: false,
              stage: "PREPARE_FAILED",
              errorName: error instanceof Error ? error.name : "UnknownError",
            },
            {
              status: 503,
              headers: { "cache-control": "no-store" },
            },
          );
        }
      },
    },
  },
});

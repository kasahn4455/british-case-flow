import { createFileRoute } from "@tanstack/react-router";

import {
  BackendConfigurationError,
  BackendPersistenceError,
} from "@/server/intake-v52/persistence";
import {
  processPublicIntakeSubmission,
  PublishedFormNotFoundError,
  SubmissionValidationError,
} from "@/server/intake-v52/service";

const MAX_BODY_BYTES = 32 * 1024;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/intake/$publishedFormId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
        }

        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
          return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
        }

        const rawText = await request.text();
        if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
          return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
        }

        let payload: unknown;
        try {
          payload = JSON.parse(rawText);
        } catch {
          return json({ error: "INVALID_JSON" }, 400);
        }

        try {
          const result = await processPublicIntakeSubmission({
            publishedFormId: params.publishedFormId,
            rawSubmission: payload,
          });

          if ("suspected_abuse" in result) {
            return json({ accepted: true }, 202);
          }

          // Never expose internal priority, derived facts, firm_id, or matched rules
          // to the prospect.
          return json({ accepted: true, enquiryReference: result.enquiry_reference }, 201);
        } catch (error) {
          if (error instanceof SubmissionValidationError) {
            return json({ error: "INVALID_SUBMISSION", issues: error.issues }, 422);
          }
          if (error instanceof PublishedFormNotFoundError) {
            return json({ error: "FORM_NOT_AVAILABLE" }, 404);
          }
          if (error instanceof BackendConfigurationError) {
            // Phase 2 code can safely exist before real persistence is configured.
            return json({ error: "BACKEND_NOT_CONFIGURED" }, 503);
          }
          if (error instanceof BackendPersistenceError) {
            console.error(error.message);
            return json({ error: "SUBMISSION_TEMPORARILY_UNAVAILABLE" }, 503);
          }

          console.error(error);
          return json({ error: "INTERNAL_ERROR" }, 500);
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

import {
  AbuseDatabaseConfigurationError,
  AbuseDatabaseError,
} from "@/server/intake-abuse/database";
import {
  AbuseFormNotAvailableError,
  AbuseProtectionConfigurationError,
  enforceIntakeAbuseControls,
  IntakeRateLimitExceededError,
  prepareIntakeAbuseContext,
} from "@/server/intake-abuse/guard";
import { TrustedClientIpUnavailableError } from "@/server/intake-abuse/identity";
import {
  TurnstileConfigurationError,
  TurnstileRejectedError,
  TurnstileUnavailableError,
} from "@/server/intake-abuse/turnstile";
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

function json(
  body: unknown,
  status: number,
  options: { setCookie?: string | null; retryAfterSeconds?: number } = {},
): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  if (options.setCookie) headers.set("set-cookie", options.setCookie);
  if (options.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(Math.max(1, options.retryAfterSeconds)));
  }
  return Response.json(body, { status, headers });
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

        let setCookie: string | null = null;
        try {
          const abuseContext = await prepareIntakeAbuseContext(request);
          setCookie = abuseContext.setCookie;
          await enforceIntakeAbuseControls({
            request,
            publishedFormId: params.publishedFormId,
            context: abuseContext,
          });

          const result = await processPublicIntakeSubmission({
            publishedFormId: params.publishedFormId,
            rawSubmission: payload,
          });

          if ("suspected_abuse" in result) {
            return json({ accepted: true }, 202, { setCookie });
          }

          // Never expose internal priority, derived facts, firm_id, or matched rules
          // to the prospect.
          return json(
            { accepted: true, enquiryReference: result.enquiry_reference },
            201,
            { setCookie },
          );
        } catch (error) {
          if (error instanceof IntakeRateLimitExceededError) {
            return json(
              { error: "TOO_MANY_REQUESTS" },
              429,
              { setCookie, retryAfterSeconds: error.retryAfterSeconds },
            );
          }
          if (error instanceof TurnstileRejectedError) {
            return json({ error: "VERIFICATION_REQUIRED" }, 403, { setCookie });
          }
          if (error instanceof SubmissionValidationError) {
            return json({ error: "INVALID_SUBMISSION", issues: error.issues }, 422, {
              setCookie,
            });
          }
          if (
            error instanceof AbuseFormNotAvailableError ||
            error instanceof PublishedFormNotFoundError
          ) {
            return json({ error: "FORM_NOT_AVAILABLE" }, 404, { setCookie });
          }
          if (
            error instanceof AbuseProtectionConfigurationError ||
            error instanceof TrustedClientIpUnavailableError ||
            error instanceof AbuseDatabaseConfigurationError ||
            error instanceof TurnstileConfigurationError ||
            error instanceof TurnstileUnavailableError ||
            error instanceof BackendConfigurationError
          ) {
            console.error(error.message);
            return json({ error: "SUBMISSION_TEMPORARILY_UNAVAILABLE" }, 503, {
              setCookie,
            });
          }
          if (error instanceof AbuseDatabaseError || error instanceof BackendPersistenceError) {
            console.error(error.message);
            return json({ error: "SUBMISSION_TEMPORARILY_UNAVAILABLE" }, 503, {
              setCookie,
            });
          }

          console.error(error);
          return json({ error: "INTERNAL_ERROR" }, 500, { setCookie });
        }
      },
    },
  },
});

import { z } from "zod";

import { checkIntakeRateLimits } from "./database.ts";
import {
  getOrCreateIntakeSession,
  getTrustedClientIp,
  hmacIdentifier,
} from "./identity.ts";
import { verifyTurnstileToken } from "./turnstile.ts";

const pepperSchema = z.string().min(32);

export class AbuseProtectionConfigurationError extends Error {
  constructor(message = "Intake abuse protection is not configured") {
    super(message);
    this.name = "AbuseProtectionConfigurationError";
  }
}

export class AbuseFormNotAvailableError extends Error {
  constructor() {
    super("Published intake form is not available");
    this.name = "AbuseFormNotAvailableError";
  }
}

export class IntakeRateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Intake request rate limit exceeded");
    this.name = "IntakeRateLimitExceededError";
  }
}

export type IntakeAbuseContext = {
  remoteIp: string;
  ipHash: string;
  sessionHash: string;
  setCookie: string | null;
};

function runtimeEnv(): Record<string, string | undefined> {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};
}

function getAbusePepper(): string {
  const parsed = pepperSchema.safeParse(runtimeEnv()["INTAKE_ABUSE_PEPPER"]);
  if (!parsed.success) throw new AbuseProtectionConfigurationError();
  return parsed.data;
}

export async function prepareIntakeAbuseContext(
  request: Request,
): Promise<IntakeAbuseContext> {
  const remoteIp = getTrustedClientIp(request);
  const { sessionId, setCookie } = getOrCreateIntakeSession(request.headers.get("cookie"));
  const pepper = getAbusePepper();
  const [ipHash, sessionHash] = await Promise.all([
    hmacIdentifier("ip", remoteIp, pepper),
    hmacIdentifier("session", sessionId, pepper),
  ]);

  return { remoteIp, ipHash, sessionHash, setCookie };
}

export async function enforceIntakeAbuseControls(args: {
  request: Request;
  publishedFormId: string;
  context: IntakeAbuseContext;
}): Promise<void> {
  // Verify the single-use challenge before consuming the durable submission quota.
  // This prevents invalid bot traffic from exhausting a shared IP/session bucket.
  await verifyTurnstileToken({
    token: args.request.headers.get("x-turnstile-token"),
    remoteIp: args.context.remoteIp,
  });

  const limit = await checkIntakeRateLimits({
    publishedFormId: args.publishedFormId,
    ipHash: args.context.ipHash,
    sessionHash: args.context.sessionHash,
  });

  if (!limit.form_available) throw new AbuseFormNotAvailableError();
  if (!limit.allowed) throw new IntakeRateLimitExceededError(limit.retry_after_seconds);
}

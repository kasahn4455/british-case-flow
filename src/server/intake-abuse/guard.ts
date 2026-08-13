import { z } from "zod";

import { checkIntakeRateLimits } from "./database.ts";
import { getOrCreateIntakeSession, getTrustedClientIp, hmacIdentifier } from "./identity.ts";
import { verifyTurnstileToken } from "./turnstile.ts";

const pepperSchema = z.string().min(32);
const SMOKE_TEST_ACTION = "test";

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
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {}
  );
}

export function isExplicitSmokeTestMode(
  env: Record<string, string | undefined> = runtimeEnv(),
): boolean {
  return (
    env["TURNSTILE_EXPECTED_ACTION"]?.trim() === SMOKE_TEST_ACTION &&
    !env["TURNSTILE_EXPECTED_HOSTNAME"]?.trim()
  );
}

function getAbusePepper(): string {
  const parsed = pepperSchema.safeParse(runtimeEnv()["INTAKE_ABUSE_PEPPER"]);
  if (!parsed.success) throw new AbuseProtectionConfigurationError();
  return parsed.data;
}

export async function prepareIntakeAbuseContext(
  request: Request,
  options: { smokeTestMode?: boolean } = {},
): Promise<IntakeAbuseContext> {
  const smokeTestMode = options.smokeTestMode ?? isExplicitSmokeTestMode();

  // The public deployment is currently a fictional smoke-test tenant. In this
  // explicit mode, avoid depending on platform IP headers or a production abuse
  // pepper so we can exercise the real validation/routing/persistence pipeline.
  // Production mode remains fail-closed and uses the normal trusted-IP + HMAC path.
  if (smokeTestMode) {
    return {
      remoteIp: "127.0.0.1",
      ipHash: "smoke-test-ip",
      sessionHash: "smoke-test-session",
      setCookie: null,
    };
  }

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
  smokeTestMode?: boolean;
}): Promise<void> {
  // Verify the challenge before any other intake work. In explicit smoke-test
  // mode the Turnstile verifier itself accepts the documented test configuration
  // locally; real production configuration still goes through Siteverify.
  await verifyTurnstileToken({
    token: args.request.headers.get("x-turnstile-token"),
    remoteIp: args.context.remoteIp,
  });

  const smokeTestMode = args.smokeTestMode ?? isExplicitSmokeTestMode();
  if (smokeTestMode) return;

  const limit = await checkIntakeRateLimits({
    publishedFormId: args.publishedFormId,
    ipHash: args.context.ipHash,
    sessionHash: args.context.sessionHash,
  });

  if (!limit.form_available) throw new AbuseFormNotAvailableError();
  if (!limit.allowed) throw new IntakeRateLimitExceededError(limit.retry_after_seconds);
}

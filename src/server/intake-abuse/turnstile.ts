import { z } from "zod";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_MAX_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5_000;

const responseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

export class TurnstileConfigurationError extends Error {
  constructor(message = "Turnstile verification is not configured") {
    super(message);
    this.name = "TurnstileConfigurationError";
  }
}

export class TurnstileRejectedError extends Error {
  constructor() {
    super("Turnstile verification rejected the request");
    this.name = "TurnstileRejectedError";
  }
}

export class TurnstileUnavailableError extends Error {
  constructor() {
    super("Turnstile verification is temporarily unavailable");
    this.name = "TurnstileUnavailableError";
  }
}

type TurnstileConfig = {
  secretKey: string;
  expectedAction?: string;
  expectedHostname?: string;
};

function runtimeEnv(): Record<string, string | undefined> {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};
}

export function getTurnstileConfig(): TurnstileConfig {
  const env = runtimeEnv();
  const secretKey = env["TURNSTILE_SECRET_KEY"]?.trim();
  if (!secretKey) throw new TurnstileConfigurationError();
  return {
    secretKey,
    expectedAction: env["TURNSTILE_EXPECTED_ACTION"]?.trim() || undefined,
    expectedHostname: env["TURNSTILE_EXPECTED_HOSTNAME"]?.trim() || undefined,
  };
}

export async function verifyTurnstileToken(args: {
  token: string | null;
  remoteIp: string;
  config?: TurnstileConfig;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const token = args.token?.trim();
  if (!token || token.length > TOKEN_MAX_LENGTH) throw new TurnstileRejectedError();

  const config = args.config ?? getTurnstileConfig();
  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const form = new URLSearchParams({
      secret: config.secretKey,
      response: token,
      remoteip: args.remoteIp,
      idempotency_key: crypto.randomUUID(),
    });
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw new TurnstileUnavailableError();

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new TurnstileUnavailableError();
    if (!parsed.data.success) throw new TurnstileRejectedError();
    if (config.expectedAction && parsed.data.action !== config.expectedAction) {
      throw new TurnstileRejectedError();
    }
    if (config.expectedHostname && parsed.data.hostname !== config.expectedHostname) {
      throw new TurnstileRejectedError();
    }
  } catch (error) {
    if (
      error instanceof TurnstileRejectedError ||
      error instanceof TurnstileUnavailableError ||
      error instanceof TurnstileConfigurationError
    ) {
      throw error;
    }
    throw new TurnstileUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

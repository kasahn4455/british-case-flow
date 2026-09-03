import { z } from "zod";

import { getOutboxSchedulerToken } from "./database.ts";

const envSchema = z.object({
  OUTBOX_WORKER_TOKEN: z.string().min(32),
});
const schedulerTokenSchema = z.string().min(32).max(256);

export class WorkerAuthConfigurationError extends Error {
  constructor() {
    super("Worker authentication is not configured");
    this.name = "WorkerAuthConfigurationError";
  }
}

function getExpectedToken(): string {
  const runtimeEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {};
  const parsed = envSchema.safeParse(runtimeEnv);
  if (!parsed.success) throw new WorkerAuthConfigurationError();
  return parsed.data.OUTBOX_WORKER_TOKEN;
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash);
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([digest(left), digest(right)]);
  let mismatch = leftDigest.length ^ rightDigest.length;
  const length = Math.max(leftDigest.length, rightDigest.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftDigest[index] ?? 0) ^ (rightDigest[index] ?? 0);
  }
  return mismatch === 0;
}

export async function isAuthorizedWorkerRequest(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const suppliedToken = authorization.slice(7);
    if (!suppliedToken) return false;
    return constantTimeEqual(suppliedToken, getExpectedToken());
  }

  const schedulerToken = schedulerTokenSchema.safeParse(
    request.headers.get("x-outbox-scheduler-token"),
  );
  if (!schedulerToken.success) return false;

  const expectedSchedulerToken = await getOutboxSchedulerToken();
  return constantTimeEqual(schedulerToken.data, expectedSchedulerToken);
}

import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const overviewRowSchema = z.object({
  published_form_id: z.string().nullable(),
  published_form_status: z.enum(["active", "paused", "revoked"]).nullable(),
  pending_count: z.number().int().nonnegative(),
  processing_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
  delivered_count: z.number().int().nonnegative(),
  dead_letter_count: z.number().int().nonnegative(),
  last_delivered_at: z.string().nullable(),
  scheduler_active: z.boolean(),
  scheduler_schedule: z.string().nullable(),
  scheduler_last_status: z.string().nullable(),
  scheduler_last_run_at: z.string().nullable(),
});

export type NotificationDeliveryMode = "test" | "live" | "unconfigured";

export type FirmSettingsOverview = {
  publishedForm: {
    id: string;
    status: "active" | "paused" | "revoked";
  } | null;
  notificationHealth: {
    deliveryMode: NotificationDeliveryMode;
    pendingCount: number;
    processingCount: number;
    failedCount: number;
    deliveredCount: number;
    deadLetterCount: number;
    lastDeliveredAt: string | null;
    schedulerActive: boolean;
    schedulerSchedule: string | null;
    schedulerLastStatus: string | null;
    schedulerLastRunAt: string | null;
  };
};

export class FirmSettingsConfigurationError extends Error {
  constructor() {
    super("Firm settings backend is not configured");
    this.name = "FirmSettingsConfigurationError";
  }
}

export class FirmSettingsPersistenceError extends Error {
  constructor() {
    super("Firm settings could not be loaded");
    this.name = "FirmSettingsPersistenceError";
  }
}

function runtimeEnv(): Record<string, string | undefined> {
  return (
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {}
  );
}

function getBackendEnv() {
  const parsed = envSchema.safeParse(runtimeEnv());
  if (!parsed.success) throw new FirmSettingsConfigurationError();
  return parsed.data;
}

function getDeliveryMode(): NotificationDeliveryMode {
  const env = runtimeEnv();
  if (!env["RESEND_API_KEY"]?.trim()) return "unconfigured";
  if (env["OUTBOX_EMAIL_TEST_RECIPIENT"]?.trim()) return "test";
  if (env["OUTBOX_EMAIL_FROM"]?.trim() && env["OUTBOX_INTERNAL_ALERT_EMAIL"]?.trim()) {
    return "live";
  }
  return "unconfigured";
}

export async function readFirmSettingsOverview(firmId: string): Promise<FirmSettingsOverview> {
  const env = getBackendEnv();
  let response: Response;
  try {
    response = await fetch(new URL("/rest/v1/rpc/get_firm_settings_overview", env.SUPABASE_URL), {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_firm_id: firmId }),
    });
  } catch {
    throw new FirmSettingsPersistenceError();
  }

  if (!response.ok) throw new FirmSettingsPersistenceError();

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new FirmSettingsPersistenceError();
  }

  const normalized = Array.isArray(raw) ? raw[0] : raw;
  const parsed = overviewRowSchema.safeParse(normalized);
  if (!parsed.success) throw new FirmSettingsPersistenceError();
  const row = parsed.data;

  return {
    publishedForm:
      row.published_form_id && row.published_form_status
        ? { id: row.published_form_id, status: row.published_form_status }
        : null,
    notificationHealth: {
      deliveryMode: getDeliveryMode(),
      pendingCount: row.pending_count,
      processingCount: row.processing_count,
      failedCount: row.failed_count,
      deliveredCount: row.delivered_count,
      deadLetterCount: row.dead_letter_count,
      lastDeliveredAt: row.last_delivered_at,
      schedulerActive: row.scheduler_active,
      schedulerSchedule: row.scheduler_schedule,
      schedulerLastStatus: row.scheduler_last_status,
      schedulerLastRunAt: row.scheduler_last_run_at,
    },
  };
}

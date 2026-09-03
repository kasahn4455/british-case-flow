import assert from "node:assert/strict";
import test from "node:test";

import { readFirmSettingsOverview } from "../../src/lib/enquiries/firm-settings.server.ts";

const FIRM_ID = "0c93be35-2fe1-4f0e-9a6c-b667f4083ec1";
const SUPABASE_SECRET = "sb_secret_settings_test_abcdefghijklmnopqrstuvwxyz";
const RESEND_KEY = "re_test_abcdefghijklmnopqrstuvwxyz123456789";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "OUTBOX_EMAIL_TEST_RECIPIENT",
  "OUTBOX_EMAIL_FROM",
  "OUTBOX_INTERNAL_ALERT_EMAIL",
] as const;

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreEnv(previous: ReturnType<typeof snapshotEnv>) {
  for (const key of ENV_KEYS) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("firm settings overview reads the live form and sanitized notification health", async () => {
  const previousEnv = snapshotEnv();
  const previousFetch = globalThis.fetch;
  process.env["SUPABASE_URL"] = "https://project.example.supabase.co";
  process.env["SUPABASE_SECRET_KEY"] = SUPABASE_SECRET;
  process.env["RESEND_API_KEY"] = RESEND_KEY;
  process.env["OUTBOX_EMAIL_TEST_RECIPIENT"] = "delivered@resend.dev";
  delete process.env["OUTBOX_EMAIL_FROM"];
  delete process.env["OUTBOX_INTERNAL_ALERT_EMAIL"];

  let capturedBody = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://project.example.supabase.co/rest/v1/rpc/get_firm_settings_overview",
    );
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), SUPABASE_SECRET);
    capturedBody = String(init?.body);
    return Response.json([
      {
        published_form_id: "demo-form-hamilton-v52-0001",
        published_form_status: "active",
        pending_count: 0,
        processing_count: 0,
        failed_count: 0,
        delivered_count: 11,
        dead_letter_count: 0,
        last_delivered_at: "2026-09-03T04:40:08.329859+00:00",
        scheduler_active: true,
        scheduler_schedule: "*/2 * * * *",
        scheduler_last_status: "succeeded",
        scheduler_last_run_at: "2026-09-03T04:42:00.024887+00:00",
      },
    ]);
  };

  try {
    const overview = await readFirmSettingsOverview(FIRM_ID);
    assert.deepEqual(JSON.parse(capturedBody), { p_firm_id: FIRM_ID });
    assert.deepEqual(overview.publishedForm, {
      id: "demo-form-hamilton-v52-0001",
      status: "active",
    });
    assert.equal(overview.notificationHealth.deliveryMode, "test");
    assert.equal(overview.notificationHealth.schedulerActive, true);
    assert.equal(overview.notificationHealth.schedulerSchedule, "*/2 * * * *");
    assert.equal(overview.notificationHealth.deliveredCount, 11);
    assert.equal(overview.notificationHealth.deadLetterCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

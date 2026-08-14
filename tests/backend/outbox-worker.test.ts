import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedWorkerRequest } from "../../src/server/outbox-worker/auth.ts";
import {
  deliverOutboxEvent,
  OutboxDeliveryError,
} from "../../src/server/outbox-worker/delivery.ts";

const WORKER_TOKEN = "worker-token-abcdefghijklmnopqrstuvwxyz-123456";
const RESEND_KEY = "re_test_abcdefghijklmnopqrstuvwxyz123456789";
const TEST_RECIPIENT = "owner@example.co.uk";
const LIVE_FROM = "Hamilton Immigration Solicitors <notifications@hamilton.testmail.co.uk>";
const INTERNAL_RECIPIENT = "enquiries@hamilton.testmail.co.uk";

const DELIVERY_ENV_KEYS = [
  "RESEND_API_KEY",
  "OUTBOX_EMAIL_TEST_RECIPIENT",
  "OUTBOX_EMAIL_FROM",
  "OUTBOX_INTERNAL_ALERT_EMAIL",
] as const;

function snapshotDeliveryEnv() {
  return Object.fromEntries(DELIVERY_ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof DELIVERY_ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreDeliveryEnv(previous: ReturnType<typeof snapshotDeliveryEnv>) {
  for (const key of DELIVERY_ENV_KEYS) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("worker endpoint requires the configured bearer token", async () => {
  const previous = process.env["OUTBOX_WORKER_TOKEN"];
  process.env["OUTBOX_WORKER_TOKEN"] = WORKER_TOKEN;
  try {
    assert.equal(
      await isAuthorizedWorkerRequest(
        new Request("https://example.test/api/workers/outbox", {
          headers: { authorization: `Bearer ${WORKER_TOKEN}` },
        }),
      ),
      true,
    );
    assert.equal(
      await isAuthorizedWorkerRequest(
        new Request("https://example.test/api/workers/outbox", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      ),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env["OUTBOX_WORKER_TOKEN"];
    else process.env["OUTBOX_WORKER_TOKEN"] = previous;
  }
});

test("Resend test mode reroutes internal alerts and preserves stable idempotency", async () => {
  const previousEnv = snapshotDeliveryEnv();
  const previousFetch = globalThis.fetch;
  process.env["RESEND_API_KEY"] = RESEND_KEY;
  process.env["OUTBOX_EMAIL_TEST_RECIPIENT"] = TEST_RECIPIENT;
  delete process.env["OUTBOX_EMAIL_FROM"];
  delete process.env["OUTBOX_INTERNAL_ALERT_EMAIL"];

  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return Response.json({ id: "email-id" }, { status: 200 });
  };

  try {
    await deliverOutboxEvent({
      event_id: "71000000-0000-0000-0000-000000000001",
      event_type: "ENQUIRY_INTERNAL_ALERT",
      idempotency_key: "alert:IM-TEST-001",
      payload: {
        enquiry_reference: "IM-TEST-001",
        message: "URGENT new enquiry — #IM-TEST-001. Secure review required.",
        priority: "URGENT",
      },
      retry_count: 2,
      created_at: "2026-08-10T10:00:00.000Z",
    });

    assert.ok(captured);
    assert.equal(captured.url, "https://api.resend.com/emails");
    const headers = new Headers(captured.init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${RESEND_KEY}`);
    assert.equal(
      headers.get("idempotency-key"),
      "outbox/71000000-0000-0000-0000-000000000001",
    );
    const body = JSON.parse(String(captured.init?.body)) as Record<string, string>;
    assert.equal(body["from"], "British Case Flow Demo <onboarding@resend.dev>");
    assert.equal(body["to"], TEST_RECIPIENT);
    assert.match(body["subject"], /^\[TEST\]/);
    assert.match(body["text"], /TEST DELIVERY ONLY/);
  } finally {
    globalThis.fetch = previousFetch;
    restoreDeliveryEnv(previousEnv);
  }
});

test("Resend test mode never sends a prospect acknowledgement to its original address", async () => {
  const previousEnv = snapshotDeliveryEnv();
  const previousFetch = globalThis.fetch;
  process.env["RESEND_API_KEY"] = RESEND_KEY;
  process.env["OUTBOX_EMAIL_TEST_RECIPIENT"] = TEST_RECIPIENT;
  delete process.env["OUTBOX_EMAIL_FROM"];
  delete process.env["OUTBOX_INTERNAL_ALERT_EMAIL"];

  let capturedBody: Record<string, string> | null = null;
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, string>;
    return Response.json({ id: "email-id" }, { status: 200 });
  };

  try {
    await deliverOutboxEvent({
      event_id: "71000000-0000-0000-0000-000000000002",
      event_type: "PROSPECT_ACKNOWLEDGEMENT",
      idempotency_key: "ack:IM-TEST-002",
      payload: {
        recipient_email: "demo@example.test",
        enquiry_reference: "IM-TEST-002",
        message_paragraphs: ["Thank you for contacting the firm.", "No retainer is created."],
        preferred_contact_method: "Email",
      },
      retry_count: 0,
      created_at: "2026-08-10T10:00:00.000Z",
    });

    assert.ok(capturedBody);
    assert.equal(capturedBody["to"], TEST_RECIPIENT);
    assert.match(capturedBody["text"], /Original destination: demo@example\.test/);
  } finally {
    globalThis.fetch = previousFetch;
    restoreDeliveryEnv(previousEnv);
  }
});

test("live delivery refuses reserved fake prospect addresses", async () => {
  const previousEnv = snapshotDeliveryEnv();
  const previousFetch = globalThis.fetch;
  process.env["RESEND_API_KEY"] = RESEND_KEY;
  delete process.env["OUTBOX_EMAIL_TEST_RECIPIENT"];
  process.env["OUTBOX_EMAIL_FROM"] = LIVE_FROM;
  process.env["OUTBOX_INTERNAL_ALERT_EMAIL"] = INTERNAL_RECIPIENT;

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ id: "email-id" }, { status: 200 });
  };

  try {
    await assert.rejects(
      () =>
        deliverOutboxEvent({
          event_id: "71000000-0000-0000-0000-000000000003",
          event_type: "PROSPECT_ACKNOWLEDGEMENT",
          idempotency_key: "ack:IM-TEST-003",
          payload: {
            recipient_email: "demo@example.test",
            enquiry_reference: "IM-TEST-003",
            message_paragraphs: ["Acknowledgement"],
          },
          retry_count: 0,
          created_at: "2026-08-10T10:00:00.000Z",
        }),
      OutboxDeliveryError,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    restoreDeliveryEnv(previousEnv);
  }
});

test("non-success Resend response is treated as retryable failure", async () => {
  const previousEnv = snapshotDeliveryEnv();
  const previousFetch = globalThis.fetch;
  process.env["RESEND_API_KEY"] = RESEND_KEY;
  process.env["OUTBOX_EMAIL_TEST_RECIPIENT"] = TEST_RECIPIENT;
  delete process.env["OUTBOX_EMAIL_FROM"];
  delete process.env["OUTBOX_INTERNAL_ALERT_EMAIL"];
  globalThis.fetch = async () => new Response(null, { status: 503 });

  try {
    await assert.rejects(
      () =>
        deliverOutboxEvent({
          event_id: "71000000-0000-0000-0000-000000000004",
          event_type: "ENQUIRY_INTERNAL_ALERT",
          idempotency_key: "alert:IM-TEST-004",
          payload: {
            enquiry_reference: "IM-TEST-004",
            message: "Secure review required.",
            priority: "ROUTINE",
          },
          retry_count: 1,
          created_at: "2026-08-10T10:00:00.000Z",
        }),
      OutboxDeliveryError,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreDeliveryEnv(previousEnv);
  }
});

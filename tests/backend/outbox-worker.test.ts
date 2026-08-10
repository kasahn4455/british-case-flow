import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedWorkerRequest } from "../../src/server/outbox-worker/auth.ts";
import {
  deliverOutboxEvent,
  OutboxDeliveryError,
} from "../../src/server/outbox-worker/delivery.ts";

const WORKER_TOKEN = "worker-token-abcdefghijklmnopqrstuvwxyz-123456";
const DELIVERY_TOKEN = "delivery-token-abcdefghijklmnopqrstuvwxyz";

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

test("delivery webhook receives stable idempotency metadata and unchanged payload", async () => {
  const previousUrl = process.env["OUTBOX_DELIVERY_WEBHOOK_URL"];
  const previousToken = process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"];
  const previousFetch = globalThis.fetch;
  process.env["OUTBOX_DELIVERY_WEBHOOK_URL"] = "https://processor.example.test/outbox";
  process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"] = DELIVERY_TOKEN;

  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(null, { status: 204 });
  };

  try {
    const payload = { enquiry_reference: "IM-TEST-001", message: "Secure review required." };
    await deliverOutboxEvent({
      event_id: "71000000-0000-0000-0000-000000000001",
      event_type: "ENQUIRY_INTERNAL_ALERT",
      idempotency_key: "alert:IM-TEST-001",
      payload,
      retry_count: 2,
      created_at: "2026-08-10T10:00:00.000Z",
    });

    assert.ok(captured);
    assert.equal(captured.url, "https://processor.example.test/outbox");
    const headers = new Headers(captured.init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${DELIVERY_TOKEN}`);
    assert.equal(headers.get("idempotency-key"), "alert:IM-TEST-001");
    assert.equal(headers.get("x-outbox-event-type"), "ENQUIRY_INTERNAL_ALERT");
    const body = JSON.parse(String(captured.init?.body)) as Record<string, unknown>;
    assert.deepEqual(body["payload"], payload);
    assert.equal(body["attempt"], 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env["OUTBOX_DELIVERY_WEBHOOK_URL"];
    else process.env["OUTBOX_DELIVERY_WEBHOOK_URL"] = previousUrl;
    if (previousToken === undefined) delete process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"];
    else process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"] = previousToken;
  }
});

test("non-success delivery response is treated as retryable failure", async () => {
  const previousUrl = process.env["OUTBOX_DELIVERY_WEBHOOK_URL"];
  const previousToken = process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"];
  const previousFetch = globalThis.fetch;
  process.env["OUTBOX_DELIVERY_WEBHOOK_URL"] = "https://processor.example.test/outbox";
  process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"] = DELIVERY_TOKEN;
  globalThis.fetch = async () => new Response(null, { status: 503 });

  try {
    await assert.rejects(
      () =>
        deliverOutboxEvent({
          event_id: "71000000-0000-0000-0000-000000000002",
          event_type: "PROSPECT_ACKNOWLEDGEMENT",
          idempotency_key: "ack:IM-TEST-002",
          payload: { recipient_email: "demo@example.test" },
          retry_count: 1,
          created_at: "2026-08-10T10:00:00.000Z",
        }),
      OutboxDeliveryError,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env["OUTBOX_DELIVERY_WEBHOOK_URL"];
    else process.env["OUTBOX_DELIVERY_WEBHOOK_URL"] = previousUrl;
    if (previousToken === undefined) delete process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"];
    else process.env["OUTBOX_DELIVERY_WEBHOOK_TOKEN"] = previousToken;
  }
});

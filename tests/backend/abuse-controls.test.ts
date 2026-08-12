import assert from "node:assert/strict";
import test from "node:test";

import {
  getOrCreateIntakeSession,
  getTrustedClientIp,
  hmacIdentifier,
  readIntakeSessionId,
  TrustedClientIpUnavailableError,
} from "../../src/server/intake-abuse/identity.ts";
import {
  TurnstileRejectedError,
  verifyTurnstileToken,
} from "../../src/server/intake-abuse/turnstile.ts";

test("Vercel requests use the platform-owned forwarded client IP", () => {
  const request = new Request("https://example.test", {
    headers: {
      "x-vercel-id": "lhr1::iad1::abc123",
      "x-vercel-forwarded-for": "203.0.113.10",
      "cf-connecting-ip": "198.51.100.77",
    },
  });
  assert.equal(getTrustedClientIp(request), "203.0.113.10");
});

test("Cloudflare requests use CF-Connecting-IP when Vercel is absent", () => {
  const request = new Request("https://example.test", {
    headers: {
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.77",
    },
  });
  assert.equal(getTrustedClientIp(request), "203.0.113.10");
});

test("generic forwarded headers are rejected without a trusted platform marker", () => {
  const request = new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  assert.throws(() => getTrustedClientIp(request), TrustedClientIpUnavailableError);
});

test("Vercel requests fail closed when the platform client IP header is missing", () => {
  const request = new Request("https://example.test", {
    headers: {
      "x-vercel-id": "lhr1::iad1::abc123",
      "cf-connecting-ip": "203.0.113.10",
    },
  });
  assert.throws(() => getTrustedClientIp(request), TrustedClientIpUnavailableError);
});

test("valid intake session cookie is reused", () => {
  const id = "7cfec748-7e98-4a33-9f7f-66fcb48f7639";
  assert.equal(readIntakeSessionId(`other=x; intake_session=${id}`), id);
  assert.deepEqual(getOrCreateIntakeSession(`intake_session=${id}`), {
    sessionId: id,
    setCookie: null,
  });
});

test("missing or malformed intake session gets a secure HttpOnly replacement", () => {
  const result = getOrCreateIntakeSession("intake_session=not-a-uuid");
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/i);
  assert(result.setCookie?.includes("HttpOnly"));
  assert(result.setCookie?.includes("Secure"));
  assert(result.setCookie?.includes("SameSite=Lax"));
});

test("HMAC pseudonyms are deterministic but domain-separated", async () => {
  const pepper = "0123456789abcdef0123456789abcdef";
  const first = await hmacIdentifier("ip", "203.0.113.10", pepper);
  const second = await hmacIdentifier("ip", "203.0.113.10", pepper);
  const session = await hmacIdentifier("session", "203.0.113.10", pepper);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, session);
});

test("Turnstile success requires expected action and hostname when configured", async () => {
  let requestBody = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return Response.json({
      success: true,
      action: "intake-submit",
      hostname: "intake.example.test",
    });
  };

  await verifyTurnstileToken({
    token: "valid-token",
    remoteIp: "203.0.113.10",
    config: {
      secretKey: "test-secret",
      expectedAction: "intake-submit",
      expectedHostname: "intake.example.test",
    },
    fetchImpl,
  });

  assert(requestBody.includes("response=valid-token"));
  assert(requestBody.includes("remoteip=203.0.113.10"));
  assert(requestBody.includes("idempotency_key="));
});

test("Turnstile rejects unsuccessful or mismatched verification", async () => {
  const rejectedFetch: typeof fetch = async () =>
    Response.json({ success: false, "error-codes": ["invalid-input-response"] });
  await assert.rejects(
    verifyTurnstileToken({
      token: "bad-token",
      remoteIp: "203.0.113.10",
      config: { secretKey: "test-secret" },
      fetchImpl: rejectedFetch,
    }),
    TurnstileRejectedError,
  );

  const mismatchFetch: typeof fetch = async () =>
    Response.json({
      success: true,
      action: "wrong-action",
      hostname: "intake.example.test",
    });
  await assert.rejects(
    verifyTurnstileToken({
      token: "valid-looking-token",
      remoteIp: "203.0.113.10",
      config: { secretKey: "test-secret", expectedAction: "intake-submit" },
      fetchImpl: mismatchFetch,
    }),
    TurnstileRejectedError,
  );
});

test("Turnstile rejects missing and oversized tokens without calling Siteverify", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ success: true });
  };
  await assert.rejects(
    verifyTurnstileToken({
      token: null,
      remoteIp: "203.0.113.10",
      config: { secretKey: "test-secret" },
      fetchImpl,
    }),
    TurnstileRejectedError,
  );
  await assert.rejects(
    verifyTurnstileToken({
      token: "x".repeat(2049),
      remoteIp: "203.0.113.10",
      config: { secretKey: "test-secret" },
      fetchImpl,
    }),
    TurnstileRejectedError,
  );
  assert.equal(calls, 0);
});

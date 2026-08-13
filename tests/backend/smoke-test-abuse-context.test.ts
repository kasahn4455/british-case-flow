import assert from "node:assert/strict";
import test from "node:test";

import {
  isExplicitSmokeTestMode,
  prepareIntakeAbuseContext,
} from "../../src/server/intake-abuse/guard.ts";
import { TrustedClientIpUnavailableError } from "../../src/server/intake-abuse/identity.ts";

test("explicit smoke-test mode is narrowly gated by test action and no hostname", () => {
  assert.equal(
    isExplicitSmokeTestMode({
      TURNSTILE_EXPECTED_ACTION: "test",
      TURNSTILE_EXPECTED_HOSTNAME: "",
    }),
    true,
  );
  assert.equal(
    isExplicitSmokeTestMode({
      TURNSTILE_EXPECTED_ACTION: "intake-submit",
      TURNSTILE_EXPECTED_HOSTNAME: "example.test",
    }),
    false,
  );
  assert.equal(
    isExplicitSmokeTestMode({
      TURNSTILE_EXPECTED_ACTION: "test",
      TURNSTILE_EXPECTED_HOSTNAME: "example.test",
    }),
    false,
  );
});

test("explicit smoke-test context does not require trusted IP headers or abuse pepper", async () => {
  const context = await prepareIntakeAbuseContext(new Request("https://example.test"), {
    smokeTestMode: true,
  });

  assert.deepEqual(context, {
    remoteIp: "127.0.0.1",
    ipHash: "smoke-test-ip",
    sessionHash: "smoke-test-session",
    setCookie: null,
  });
});

test("production context still fails closed without trusted platform IP", async () => {
  await assert.rejects(
    prepareIntakeAbuseContext(new Request("https://example.test"), {
      smokeTestMode: false,
    }),
    TrustedClientIpUnavailableError,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedWorkerRequest } from "../../src/server/outbox-worker/auth.ts";

const SCHEDULER_TOKEN = "scheduler-token-abcdefghijklmnopqrstuvwxyz-0123456789-abcdefgh";
const SUPABASE_SECRET = "sb_secret_scheduler_test_abcdefghijklmnopqrstuvwxyz";

test("database scheduler header authorizes only the Vault-backed token", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env["SUPABASE_URL"];
  const previousSecret = process.env["SUPABASE_SECRET_KEY"];
  const previousWorkerToken = process.env["OUTBOX_WORKER_TOKEN"];

  process.env["SUPABASE_URL"] = "https://project.example.supabase.co";
  process.env["SUPABASE_SECRET_KEY"] = SUPABASE_SECRET;
  delete process.env["OUTBOX_WORKER_TOKEN"];

  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(
      String(input),
      "https://project.example.supabase.co/rest/v1/rpc/get_outbox_scheduler_token",
    );
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), SUPABASE_SECRET);
    return Response.json(SCHEDULER_TOKEN);
  };

  try {
    assert.equal(
      await isAuthorizedWorkerRequest(
        new Request("https://example.test/api/workers/outbox", {
          headers: { "x-outbox-scheduler-token": SCHEDULER_TOKEN },
        }),
      ),
      true,
    );
    assert.equal(
      await isAuthorizedWorkerRequest(
        new Request("https://example.test/api/workers/outbox", {
          headers: {
            "x-outbox-scheduler-token":
              "scheduler-token-wrong-abcdefghijklmnopqrstuvwxyz-0123456789",
          },
        }),
      ),
      false,
    );
    assert.equal(
      await isAuthorizedWorkerRequest(
        new Request("https://example.test/api/workers/outbox"),
      ),
      false,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env["SUPABASE_URL"];
    else process.env["SUPABASE_URL"] = previousUrl;
    if (previousSecret === undefined) delete process.env["SUPABASE_SECRET_KEY"];
    else process.env["SUPABASE_SECRET_KEY"] = previousSecret;
    if (previousWorkerToken === undefined) delete process.env["OUTBOX_WORKER_TOKEN"];
    else process.env["OUTBOX_WORKER_TOKEN"] = previousWorkerToken;
  }
});

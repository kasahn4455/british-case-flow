import { z } from "zod";

import type {
  CanonicalIntakeSubmission,
  PersistedSubmissionResult,
  ResolvedPublishedForm,
  RoutingResult,
} from "./contracts.ts";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

export class BackendConfigurationError extends Error {
  constructor(message = "Backend persistence is not configured") {
    super(message);
    this.name = "BackendConfigurationError";
  }
}

export class BackendPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendPersistenceError";
  }
}

function getBackendEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new BackendConfigurationError();
  return parsed.data;
}

function serviceHeaders(secretKey: string): HeadersInit {
  // Current Supabase secret keys are opaque and should be sent via apikey only.
  // Never add this key to browser code, VITE_* variables, URLs, or logs.
  return {
    apikey: secretKey,
    "content-type": "application/json",
  };
}

export async function resolvePublishedForm(
  publishedFormId: string,
): Promise<ResolvedPublishedForm | null> {
  const env = getBackendEnv();
  const url = new URL("/rest/v1/published_forms", env.SUPABASE_URL);
  url.searchParams.set("published_form_id", `eq.${publishedFormId}`);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("select", "id,firm_id,configuration_id");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: serviceHeaders(env.SUPABASE_SECRET_KEY),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new BackendPersistenceError(
      `Published form resolution failed with status ${response.status}`,
    );
  }

  const rows = (await response.json()) as ResolvedPublishedForm[];
  return rows[0] ?? null;
}

export async function persistSubmissionAtomically(args: {
  publishedFormId: string;
  submission: CanonicalIntakeSubmission;
  submissionHash: string;
  routing: RoutingResult;
}): Promise<PersistedSubmissionResult> {
  const env = getBackendEnv();
  const url = new URL("/rest/v1/rpc/persist_intake_submission_v52", env.SUPABASE_URL);

  const response = await fetch(url, {
    method: "POST",
    headers: serviceHeaders(env.SUPABASE_SECRET_KEY),
    cache: "no-store",
    body: JSON.stringify({
      p_published_form_id: args.publishedFormId,
      p_submission: args.submission,
      p_submission_hash: args.submissionHash,
      p_derived_facts: args.routing.derived_facts,
      p_priority: args.routing.priority,
      p_matched_rule_ids: args.routing.matched_rule_ids,
      p_priority_reason: args.routing.priority_reason,
      p_schema_version: "5.2",
      p_routing_rule_version: args.routing.routing_rule_version,
    }),
  });

  if (!response.ok) {
    throw new BackendPersistenceError(
      `Atomic submission persistence failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as
    | PersistedSubmissionResult
    | PersistedSubmissionResult[];
  const normalized = Array.isArray(result) ? result[0] : result;
  if (!normalized?.enquiry_id || !normalized.enquiry_reference) {
    throw new BackendPersistenceError("Atomic submission persistence returned an invalid response");
  }
  return normalized;
}

function stableClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableClone);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableClone(child)]),
    );
  }
  return value;
}

export async function hashSubmission(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stableClone(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

import { z } from "zod";

import type { ClaimedOutboxEvent } from "./database";

const TEST_FROM = "British Case Flow Demo <onboarding@resend.dev>";
const RESEND_EMAIL_URL = "https://api.resend.com/emails";

const envSchema = z.object({
  RESEND_API_KEY: z.string().min(20),
  OUTBOX_EMAIL_TEST_RECIPIENT: z.string().email().optional(),
  OUTBOX_EMAIL_FROM: z.string().min(3).optional(),
  OUTBOX_INTERNAL_ALERT_EMAIL: z.string().email().optional(),
});

const internalAlertSchema = z.object({
  message: z.string().min(1).max(2000),
  priority: z.enum(["CRITICAL", "URGENT", "PRIORITY", "MANUAL_REVIEW", "ROUTINE"]),
  enquiry_reference: z.string().min(1).max(120),
});

const acknowledgementSchema = z.object({
  recipient_email: z.string().email(),
  enquiry_reference: z.string().min(1).max(120),
  message_paragraphs: z.array(z.string().min(1).max(5000)).min(1).max(10),
  preferred_contact_method: z.string().optional(),
});

type DeliveryEnvironment = z.infer<typeof envSchema>;

type ResendEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

export class OutboxDeliveryConfigurationError extends Error {
  constructor() {
    super("Outbox email delivery is not configured");
    this.name = "OutboxDeliveryConfigurationError";
  }
}

export class OutboxDeliveryError extends Error {
  constructor() {
    super("Outbox event delivery failed");
    this.name = "OutboxDeliveryError";
  }
}

function getRuntimeEnv(): Record<string, string | undefined> {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};
}

function getEnv(): DeliveryEnvironment {
  const parsed = envSchema.safeParse(getRuntimeEnv());
  if (!parsed.success) throw new OutboxDeliveryConfigurationError();

  const env = parsed.data;
  if (!env.OUTBOX_EMAIL_TEST_RECIPIENT && (!env.OUTBOX_EMAIL_FROM || !env.OUTBOX_INTERNAL_ALERT_EMAIL)) {
    throw new OutboxDeliveryConfigurationError();
  }

  return env;
}

function isReservedTestAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return (
    domain === "example.com" ||
    domain === "example.net" ||
    domain === "example.org" ||
    domain.endsWith(".test") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".localhost")
  );
}

function withTestPrelude(text: string, event: ClaimedOutboxEvent, originalDestination: string): string {
  return [
    "TEST DELIVERY ONLY — no prospect notification was sent to the original destination.",
    `Event type: ${event.event_type}`,
    `Original destination: ${originalDestination}`,
    "",
    text,
  ].join("\n");
}

function buildResendEmail(event: ClaimedOutboxEvent, env: DeliveryEnvironment): ResendEmail {
  const testRecipient = env.OUTBOX_EMAIL_TEST_RECIPIENT;
  const from = testRecipient ? TEST_FROM : env.OUTBOX_EMAIL_FROM!;

  if (event.event_type === "ENQUIRY_INTERNAL_ALERT") {
    const payload = internalAlertSchema.safeParse(event.payload);
    if (!payload.success) throw new OutboxDeliveryError();

    const liveRecipient = env.OUTBOX_INTERNAL_ALERT_EMAIL ?? "firm internal alert inbox";
    const text = [
      payload.data.message,
      "",
      "Open the secure staff workspace to review this enquiry. Do not include client-sensitive information in email replies.",
    ].join("\n");

    return {
      from,
      to: testRecipient ?? liveRecipient,
      subject: `${testRecipient ? "[TEST] " : ""}[${payload.data.priority}] New enquiry ${payload.data.enquiry_reference}`,
      text: testRecipient ? withTestPrelude(text, event, liveRecipient) : text,
    };
  }

  const payload = acknowledgementSchema.safeParse(event.payload);
  if (!payload.success) throw new OutboxDeliveryError();
  if (!testRecipient && isReservedTestAddress(payload.data.recipient_email)) {
    throw new OutboxDeliveryError();
  }

  const text = payload.data.message_paragraphs.join("\n\n");
  return {
    from,
    to: testRecipient ?? payload.data.recipient_email,
    subject: `${testRecipient ? "[TEST] " : ""}We received your enquiry — ${payload.data.enquiry_reference}`,
    text: testRecipient
      ? withTestPrelude(text, event, payload.data.recipient_email)
      : text,
  };
}

export function assertOutboxDeliveryConfigured(): void {
  getEnv();
}

export async function deliverOutboxEvent(event: ClaimedOutboxEvent): Promise<void> {
  const env = getEnv();
  const email = buildResendEmail(event, env);
  const response = await fetch(RESEND_EMAIL_URL, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `outbox/${event.event_id}`,
    },
    body: JSON.stringify(email),
  });

  if (!response.ok) throw new OutboxDeliveryError();
}

import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const statusSchema = z.enum(["NEW", "IN_REVIEW", "CONTACTED", "AWAITING_CLIENT", "CLOSED"]);
const prioritySchema = z.enum(["CRITICAL", "URGENT", "PRIORITY", "MANUAL_REVIEW", "ROUTINE"]);

const enquiryMutationResponseSchema = z.object({
  public_reference: z.string(),
  priority: prioritySchema,
  status: statusSchema,
  assigned_staff_membership_id: z.string().uuid().nullable(),
  updated_at: z.string(),
});

const contactLogResponseSchema = z.object({
  id: z.string().uuid(),
  channel: z.enum(["PHONE", "EMAIL", "SMS", "OTHER"]),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  outcome: z.string(),
  notes: z.string().nullable(),
  contacted_at: z.string(),
});

export type StaffEnquiryMutationResult = z.infer<typeof enquiryMutationResponseSchema>;
export type ContactLogMutationResult = z.infer<typeof contactLogResponseSchema>;

export class StaffActionConfigurationError extends Error {
  constructor() {
    super("Staff action backend is not configured");
    this.name = "StaffActionConfigurationError";
  }
}

export class StaffActionPersistenceError extends Error {
  constructor() {
    super("Staff action could not be applied");
    this.name = "StaffActionPersistenceError";
  }
}

function getBackendEnv() {
  const runtimeEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {};
  const parsed = envSchema.safeParse(runtimeEnv);
  if (!parsed.success) throw new StaffActionConfigurationError();
  return parsed.data;
}

async function callRpc<T>(rpcName: string, body: Record<string, unknown>, schema: z.ZodType<T>) {
  const env = getBackendEnv();
  const url = new URL(`/rest/v1/rpc/${rpcName}`, env.SUPABASE_URL);
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new StaffActionPersistenceError();
  const raw = (await response.json()) as unknown;
  const normalized = Array.isArray(raw) ? raw[0] : raw;
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) throw new StaffActionPersistenceError();
  return parsed.data;
}

export function applyStaffAssignment(args: {
  publicReference: string;
  actorUserId: string;
  assignToSelf: boolean;
}): Promise<StaffEnquiryMutationResult> {
  return callRpc(
    "staff_assign_enquiry",
    {
      p_public_reference: args.publicReference,
      p_actor_user_id: args.actorUserId,
      p_assign_to_self: args.assignToSelf,
    },
    enquiryMutationResponseSchema,
  );
}

export function applyStatusChange(args: {
  publicReference: string;
  actorUserId: string;
  newStatus: z.infer<typeof statusSchema>;
}): Promise<StaffEnquiryMutationResult> {
  return callRpc(
    "staff_change_enquiry_status",
    {
      p_public_reference: args.publicReference,
      p_new_status: args.newStatus,
      p_actor_user_id: args.actorUserId,
    },
    enquiryMutationResponseSchema,
  );
}

export function applyContactLog(args: {
  publicReference: string;
  actorUserId: string;
  channel: "PHONE" | "EMAIL" | "SMS" | "OTHER";
  direction: "INBOUND" | "OUTBOUND";
  outcome: string;
  notes?: string;
}): Promise<ContactLogMutationResult> {
  return callRpc(
    "staff_log_contact",
    {
      p_public_reference: args.publicReference,
      p_actor_user_id: args.actorUserId,
      p_channel: args.channel,
      p_direction: args.direction,
      p_outcome: args.outcome,
      p_notes: args.notes?.trim() || null,
      p_contacted_at: new Date().toISOString(),
    },
    contactLogResponseSchema,
  );
}

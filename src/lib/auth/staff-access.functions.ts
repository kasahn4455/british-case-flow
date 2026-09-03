import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readStaffAuthState } from "./staff-auth.server";
import type { StaffRole } from "./staff-auth-state";

const staffRoleSchema = z.enum(["staff", "senior", "manager", "admin"]);
const managedStatusSchema = z.enum(["active", "suspended", "revoked"]);

const staffMemberRowSchema = z.object({
  membership_id: z.string().uuid(),
  auth_user_id: z.string().uuid(),
  email: z.string().email().nullable(),
  role: staffRoleSchema,
  status: z.enum(["active", "suspended", "revoked"]),
  invited_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  last_sign_in_at: z.string().nullable(),
  mfa_verified: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ManagedStaffStatus = z.infer<typeof managedStatusSchema>;
export type FirmStaffMember = {
  membershipId: string;
  authUserId: string;
  email: string | null;
  role: StaffRole;
  status: "active" | "suspended" | "revoked";
  invitedAt: string | null;
  confirmedAt: string | null;
  lastSignInAt: string | null;
  mfaVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

function requireAal2Admin(state: Awaited<ReturnType<typeof readStaffAuthState>>) {
  if (
    state.kind !== "staff" ||
    state.currentLevel !== "aal2" ||
    state.nextLevel !== "aal2" ||
    state.role !== "admin"
  ) {
    throw new Error("An MFA-verified admin session is required");
  }
  return state;
}

function mapMember(row: z.infer<typeof staffMemberRowSchema>): FirmStaffMember {
  return {
    membershipId: row.membership_id,
    authUserId: row.auth_user_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedAt: row.invited_at,
    confirmedAt: row.confirmed_at,
    lastSignInAt: row.last_sign_in_at,
    mfaVerified: row.mfa_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const getFirmStaffForAdmin = createServerFn({ method: "GET" }).handler(async () => {
  requireAal2Admin(await readStaffAuthState());
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_firm_staff_for_admin");
  if (error) throw new Error("Staff access list could not be loaded");

  const parsed = z.array(staffMemberRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error("Staff access list returned an invalid response");
  return parsed.data.map(mapMember);
});

const updateInputSchema = z.object({
  membershipId: z.string().uuid(),
  role: staffRoleSchema,
  status: managedStatusSchema,
});

export const updateFirmStaffAccess = createServerFn({ method: "POST" })
  .validator(updateInputSchema)
  .handler(async ({ data }) => {
    requireAal2Admin(await readStaffAuthState());
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("admin_update_staff_membership", {
      p_membership_id: data.membershipId,
      p_role: data.role,
      p_status: data.status,
    });
    if (error) {
      console.error(`Staff access update failed: code=${error.code ?? "unknown"}`);
      throw new Error("Staff access could not be updated");
    }
    return { updated: true } as const;
  });

const inviteInputSchema = z.object({
  email: z.string().trim().email().max(254),
  role: staffRoleSchema,
});

export const inviteFirmStaff = createServerFn({ method: "POST" })
  .validator(inviteInputSchema)
  .handler(async ({ data }) => {
    const state = requireAal2Admin(await readStaffAuthState());
    const admin = createSupabaseAdminClient();
    const redirectTo = new URL("/staff/activate", getRequestUrl()).toString();

    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      data.email.toLowerCase(),
      {
        redirectTo,
        data: {
          british_case_flow_firm_id: state.firmId,
          british_case_flow_role: data.role,
        },
      },
    );

    if (inviteError || !invite.user) {
      console.error(`Staff invitation failed: code=${inviteError?.code ?? "unknown"}`);
      throw new Error("Staff invitation could not be sent");
    }

    const { error: membershipError } = await admin.rpc("service_register_invited_staff", {
      p_firm_id: state.firmId,
      p_actor_auth_user_id: state.userId,
      p_auth_user_id: invite.user.id,
      p_role: data.role,
    });

    if (membershipError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(invite.user.id);
      console.error(
        `Staff invitation membership registration failed: code=${membershipError.code ?? "unknown"} cleanup=${cleanupError?.code ?? "ok"}`,
      );
      throw new Error("Staff invitation could not be provisioned");
    }

    return { invited: true, email: data.email.toLowerCase() } as const;
  });

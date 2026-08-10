import type {
  AuthenticatorLevel,
  StaffAuthState,
  StaffRole,
} from "./staff-auth-state";
import {
  createSupabaseServerClient,
  StaffAuthServerConfigurationError,
} from "../supabase/server";

function normalizeAuthenticatorLevel(value: unknown): AuthenticatorLevel {
  return value === "aal1" || value === "aal2" ? value : null;
}

export async function readStaffAuthState(): Promise<StaffAuthState> {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    if (error instanceof StaffAuthServerConfigurationError) return { kind: "not_configured" };
    throw error;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { kind: "anonymous" };

  const { data: membership, error: membershipError } = await supabase
    .from("staff_memberships")
    .select("firm_id, role, status")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return { kind: "no_access", email: user.email ?? null };

  const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

  if (assuranceError) throw assuranceError;
  if (factorsError) throw factorsError;

  return {
    kind: "staff",
    userId: user.id,
    email: user.email ?? null,
    firmId: membership.firm_id as string,
    role: membership.role as StaffRole,
    currentLevel: normalizeAuthenticatorLevel(assurance.currentLevel),
    nextLevel: normalizeAuthenticatorLevel(assurance.nextLevel),
    verifiedTotpFactorIds: (factors.totp ?? []).map((factor) => factor.id),
  };
}

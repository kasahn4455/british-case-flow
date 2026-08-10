export type StaffRole = "staff" | "senior" | "manager" | "admin";
export type AuthenticatorLevel = "aal1" | "aal2" | null;

export type StaffAuthState =
  | { kind: "not_configured" }
  | { kind: "anonymous" }
  | { kind: "no_access"; email: string | null }
  | {
      kind: "staff";
      userId: string;
      email: string | null;
      firmId: string;
      role: StaffRole;
      currentLevel: AuthenticatorLevel;
      nextLevel: AuthenticatorLevel;
      verifiedTotpFactorIds: string[];
    };

export type StaffDestination = "/login" | "/mfa/setup" | "/mfa/challenge" | "/app/enquiries";

export function getStaffDestination(state: StaffAuthState): StaffDestination {
  if (state.kind !== "staff") return "/login";

  // Require both levels to be aal2. current=aal2/next=aal1 is a stale-session
  // condition after a factor was removed and must not unlock the workspace.
  if (state.currentLevel === "aal2" && state.nextLevel === "aal2") {
    return "/app/enquiries";
  }

  if (state.nextLevel === "aal2" && state.verifiedTotpFactorIds.length > 0) {
    return "/mfa/challenge";
  }

  return "/mfa/setup";
}

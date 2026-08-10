import assert from "node:assert/strict";
import test from "node:test";

import { getStaffDestination, type StaffAuthState } from "../../src/lib/auth/staff-auth-state.ts";

function staff(overrides: Partial<Extract<StaffAuthState, { kind: "staff" }>> = {}) {
  return {
    kind: "staff" as const,
    userId: "00000000-0000-0000-0000-000000000001",
    email: "staff@example.test",
    firmId: "10000000-0000-0000-0000-000000000001",
    role: "staff" as const,
    currentLevel: "aal1" as const,
    nextLevel: "aal1" as const,
    verifiedTotpFactorIds: [] as string[],
    ...overrides,
  };
}

test("unconfigured auth returns login", () => {
  assert.equal(getStaffDestination({ kind: "not_configured" }), "/login");
});

test("anonymous auth returns login", () => {
  assert.equal(getStaffDestination({ kind: "anonymous" }), "/login");
});

test("authenticated user without active firm membership returns login", () => {
  assert.equal(
    getStaffDestination({ kind: "no_access", email: "outsider@example.test" }),
    "/login",
  );
});

test("aal1 staff with no verified TOTP factor must enroll", () => {
  assert.equal(getStaffDestination(staff()), "/mfa/setup");
});

test("aal1 staff with verified TOTP factor must challenge", () => {
  assert.equal(
    getStaffDestination(staff({ nextLevel: "aal2", verifiedTotpFactorIds: ["factor-1"] })),
    "/mfa/challenge",
  );
});

test("aal2 staff may enter the workspace", () => {
  assert.equal(
    getStaffDestination(
      staff({
        currentLevel: "aal2",
        nextLevel: "aal2",
        verifiedTotpFactorIds: ["factor-1"],
      }),
    ),
    "/app/enquiries",
  );
});

test("stale aal2 current session with downgraded next level cannot enter workspace", () => {
  assert.equal(
    getStaffDestination(
      staff({
        currentLevel: "aal2",
        nextLevel: "aal1",
        verifiedTotpFactorIds: [],
      }),
    ),
    "/mfa/setup",
  );
});

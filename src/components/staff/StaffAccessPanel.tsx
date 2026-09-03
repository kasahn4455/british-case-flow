import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import {
  inviteFirmStaff,
  type FirmStaffMember,
  updateFirmStaffAccess,
} from "@/lib/auth/staff-access.functions";
import type { StaffRole } from "@/lib/auth/staff-auth-state";
import { formatReceived } from "@/lib/enquiries/live-enquiries";

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "senior", label: "Senior" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

type Props = {
  currentUserId: string;
  members: FirmStaffMember[];
};

export function StaffAccessPanel({ currentUserId, members }: Props) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("staff");
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  return (
    <section className="rounded-md border border-border bg-card px-5 py-5 lg:col-span-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Staff access
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Invite staff, control their role, and suspend or restore workspace access. Every access
          change is recorded. Staff must complete multi-factor authentication before they can open
          enquiries.
        </p>

        <form
          className="mt-5 grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
          onSubmit={async (event) => {
            event.preventDefault();
            setMessage("");
            setError("");
            setInviting(true);
            try {
              const result = await inviteFirmStaff({
                data: { email: inviteEmail, role: inviteRole },
              });
              setMessage(`Invitation sent to ${result.email}.`);
              setInviteEmail("");
              setInviteRole("staff");
              await router.invalidate();
            } catch (caught) {
              console.error(caught);
              setError(
                "The invitation could not be sent. The address may already have an account or the authentication email service may be unavailable.",
              );
            } finally {
              setInviting(false);
            }
          }}
        >
          <div>
            <label htmlFor="staff-invite-email" className="text-sm font-semibold text-foreground">
              Work email
            </label>
            <input
              id="staff-invite-email"
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              disabled={inviting}
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="staff-invite-role" className="text-sm font-semibold text-foreground">
              Role
            </label>
            <select
              id="staff-invite-role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as StaffRole)}
              disabled={inviting}
              className="mt-2 block h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="h-11 w-full rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {inviting ? "Sending…" : "Invite staff"}
            </button>
          </div>
        </form>

        {message ? (
          <p className="mt-4 rounded-md border border-border px-3 py-3 text-sm">{message}</p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Staff member</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Access</th>
                <th className="px-4 py-3 font-semibold">MFA</th>
                <th className="px-4 py-3 font-semibold">Last sign-in</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <StaffAccessRow
                  key={`${member.membershipId}:${member.updatedAt}`}
                  member={member}
                  isSelf={member.authUserId === currentUserId}
                  onChanged={() => router.invalidate()}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

type RowProps = {
  member: FirmStaffMember;
  isSelf: boolean;
  onChanged: () => Promise<void>;
};

function StaffAccessRow({ member, isSelf, onChanged }: RowProps) {
  const [role, setRole] = useState<StaffRole>(member.role);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState("");
  const canManage = !isSelf && member.status !== "revoked";
  const accountLabel =
    member.status === "suspended"
      ? "Suspended"
      : member.status === "revoked"
        ? "Revoked"
        : !member.confirmedAt && member.invitedAt
          ? "Invitation pending"
          : "Active";

  async function apply(nextRole: StaffRole, nextStatus: "active" | "suspended" | "revoked") {
    setBusy(true);
    setRowError("");
    try {
      await updateFirmStaffAccess({
        data: {
          membershipId: member.membershipId,
          role: nextRole,
          status: nextStatus,
        },
      });
      await onChanged();
    } catch (caught) {
      console.error(caught);
      setRowError(
        "This access change could not be saved. An administrator cannot change their own access, and the firm must retain at least one active administrator.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-4">
        <div className="font-medium text-foreground">
          {member.email ?? "Email unavailable"}{" "}
          {isSelf ? <span className="text-muted-foreground">(you)</span> : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Added {formatReceived(member.createdAt)}
        </div>
        {rowError ? <p className="mt-2 max-w-sm text-xs text-destructive">{rowError}</p> : null}
      </td>
      <td className="px-4 py-4">
        <select
          aria-label={`Role for ${member.email ?? "staff member"}`}
          value={role}
          onChange={(event) => setRole(event.target.value as StaffRole)}
          disabled={!canManage || busy}
          className="h-10 rounded-md border border-input bg-card px-2 text-sm disabled:opacity-60"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-4">
        <span className="font-medium text-foreground">{accountLabel}</span>
      </td>
      <td className="px-4 py-4">{member.mfaVerified ? "Verified" : "Not yet verified"}</td>
      <td className="px-4 py-4">
        {member.lastSignInAt ? formatReceived(member.lastSignInAt) : "Never"}
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canManage || busy || role === member.role || member.status !== "active"}
            onClick={() => apply(role, "active")}
            className="h-9 rounded-md border border-border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save role
          </button>
          {member.status === "active" ? (
            <button
              type="button"
              disabled={!canManage || busy}
              onClick={() => apply(member.role, "suspended")}
              className="h-9 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              Suspend
            </button>
          ) : member.status === "suspended" ? (
            <button
              type="button"
              disabled={!canManage || busy}
              onClick={() => apply(member.role, "active")}
              className="h-9 rounded-md border border-border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reactivate
            </button>
          ) : null}
          {member.status !== "revoked" ? (
            <button
              type="button"
              disabled={!canManage || busy}
              onClick={() => {
                const action = member.confirmedAt
                  ? "remove this staff member's access"
                  : "cancel this invitation";
                if (window.confirm(`Are you sure you want to ${action}? This action is audited.`)) {
                  void apply(member.role, "revoked");
                }
              }}
              className="h-9 rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              {member.confirmedAt ? "Remove access" : "Cancel invitation"}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

import { createFileRoute, redirect } from "@tanstack/react-router";

import { StaffAccessPanel } from "@/components/staff/StaffAccessPanel";
import { getFirmStaffForAdmin } from "@/lib/auth/staff-access.functions";
import { getStaffAuthState } from "@/lib/auth/staff-auth.functions";
import { FIRM } from "@/lib/mock/firm";

export const Route = createFileRoute("/app/staff")({
  loader: async () => {
    const authState = await getStaffAuthState();
    if (authState.kind !== "staff" || authState.role !== "admin") {
      throw redirect({ to: "/app/enquiries" });
    }

    const members = await getFirmStaffForAdmin();
    return { authState, members };
  },
  head: () => ({
    meta: [
      { title: `Staff access — ${FIRM.shortName}` },
      {
        name: "description",
        content: "Admin-only staff account and workspace access management.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffAccessPage,
});

function StaffAccessPage() {
  const { authState, members } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
          Staff accounts and permissions
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Administrator-only access control for this firm. Invitations create a staff account;
          invited users must set a password and complete MFA before opening enquiries.
        </p>
      </div>

      <div className="grid gap-6">
        <StaffAccessPanel currentUserId={authState.userId} members={members} />
      </div>
    </div>
  );
}

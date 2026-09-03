-- Keep the public PostgREST surface SECURITY INVOKER while privileged reads and
-- mutations remain in the non-exposed private schema. The private helpers still
-- perform the same AAL2, active-admin and tenant checks before doing any work.

alter function public.list_firm_staff_for_admin() set schema private;
alter function public.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) set schema private;

revoke all on function private.list_firm_staff_for_admin() from public;
revoke all on function private.list_firm_staff_for_admin() from anon;
revoke all on function private.list_firm_staff_for_admin() from authenticated;
grant execute on function private.list_firm_staff_for_admin() to authenticated;

revoke all on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from public;
revoke all on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from anon;
revoke all on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from authenticated;
grant execute on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) to authenticated;

create function public.list_firm_staff_for_admin()
returns table (
  membership_id uuid,
  auth_user_id uuid,
  email text,
  role public.staff_role,
  status public.membership_status,
  invited_at timestamptz,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  mfa_verified boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select * from private.list_firm_staff_for_admin();
$$;

revoke all on function public.list_firm_staff_for_admin() from public;
revoke all on function public.list_firm_staff_for_admin() from anon;
grant execute on function public.list_firm_staff_for_admin() to authenticated;

create function public.admin_update_staff_membership(
  p_membership_id uuid,
  p_role public.staff_role,
  p_status public.membership_status
)
returns table (
  membership_id uuid,
  auth_user_id uuid,
  role public.staff_role,
  status public.membership_status,
  updated_at timestamptz
)
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$
  select *
  from private.admin_update_staff_membership(p_membership_id, p_role, p_status);
$$;

revoke all on function public.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from public;
revoke all on function public.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from anon;
grant execute on function public.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) to authenticated;

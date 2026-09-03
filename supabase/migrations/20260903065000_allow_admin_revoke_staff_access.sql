-- Allow an MFA-verified firm administrator to revoke another membership.
-- Revocation retains the membership and access-log history instead of deleting
-- the Auth user or breaking enquiry/audit foreign keys.

create or replace function private.admin_update_staff_membership(
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
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_actor_firm_id uuid;
  v_target public.staff_memberships%rowtype;
  v_updated public.staff_memberships%rowtype;
  v_other_active_admins integer;
begin
  if not private.has_aal2() then
    raise exception 'An MFA-verified admin session is required' using errcode = '42501';
  end if;

  select sm.firm_id
  into v_actor_firm_id
  from public.staff_memberships sm
  where sm.auth_user_id = auth.uid()
    and sm.status = 'active'::public.membership_status
    and sm.role = 'admin'::public.staff_role
  limit 1;

  if v_actor_firm_id is null then
    raise exception 'An MFA-verified admin session is required' using errcode = '42501';
  end if;

  if p_status not in (
    'active'::public.membership_status,
    'suspended'::public.membership_status,
    'revoked'::public.membership_status
  ) then
    raise exception 'Staff access may only be active, suspended or revoked' using errcode = '22023';
  end if;

  select sm.*
  into v_target
  from public.staff_memberships sm
  where sm.id = p_membership_id
    and sm.firm_id = v_actor_firm_id
  for update;

  if v_target.id is null then
    raise exception 'Staff membership not found' using errcode = 'P0001';
  end if;

  if v_target.auth_user_id = auth.uid()
     and (v_target.role is distinct from p_role or v_target.status is distinct from p_status) then
    raise exception 'Administrators cannot change their own role or access status' using errcode = 'P0001';
  end if;

  if v_target.role = p_role and v_target.status = p_status then
    return query
    select v_target.id, v_target.auth_user_id, v_target.role, v_target.status, v_target.updated_at;
    return;
  end if;

  if v_target.role = 'admin'::public.staff_role
     and v_target.status = 'active'::public.membership_status
     and (p_role <> 'admin'::public.staff_role or p_status <> 'active'::public.membership_status) then
    select count(*)::integer
    into v_other_active_admins
    from public.staff_memberships sm
    where sm.firm_id = v_actor_firm_id
      and sm.id <> v_target.id
      and sm.role = 'admin'::public.staff_role
      and sm.status = 'active'::public.membership_status;

    if v_other_active_admins = 0 then
      raise exception 'The firm must retain at least one active administrator' using errcode = 'P0001';
    end if;
  end if;

  update public.staff_memberships sm
  set role = p_role,
      status = p_status,
      updated_at = now()
  where sm.id = v_target.id
  returning sm.* into v_updated;

  insert into public.access_logs (
    firm_id,
    auth_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_actor_firm_id,
    auth.uid(),
    case
      when v_updated.status = 'revoked'::public.membership_status then 'STAFF_MEMBERSHIP_REVOKED'
      else 'STAFF_MEMBERSHIP_UPDATED'
    end,
    'staff_membership',
    v_target.id,
    jsonb_build_object(
      'target_auth_user_id', v_target.auth_user_id,
      'previous_role', v_target.role,
      'new_role', v_updated.role,
      'previous_status', v_target.status,
      'new_status', v_updated.status
    )
  );

  return query
  select v_updated.id, v_updated.auth_user_id, v_updated.role, v_updated.status, v_updated.updated_at;
end;
$$;

revoke all on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from public;
revoke all on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from anon;
revoke all on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from authenticated;
grant execute on function private.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) to authenticated;


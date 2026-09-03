create or replace function public.list_firm_staff_for_admin()
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
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_firm_id uuid;
begin
  if not private.has_aal2() then
    raise exception 'An MFA-verified admin session is required' using errcode = '42501';
  end if;

  select sm.firm_id
  into v_firm_id
  from public.staff_memberships sm
  where sm.auth_user_id = auth.uid()
    and sm.status = 'active'::public.membership_status
    and sm.role = 'admin'::public.staff_role
  limit 1;

  if v_firm_id is null then
    raise exception 'An MFA-verified admin session is required' using errcode = '42501';
  end if;

  return query
  select
    sm.id,
    sm.auth_user_id,
    u.email,
    sm.role,
    sm.status,
    u.invited_at,
    coalesce(u.confirmed_at, u.email_confirmed_at),
    u.last_sign_in_at,
    exists (
      select 1
      from auth.mfa_factors mf
      where mf.user_id = u.id
        and mf.status::text = 'verified'
    ),
    sm.created_at,
    sm.updated_at
  from public.staff_memberships sm
  join auth.users u on u.id = sm.auth_user_id
  where sm.firm_id = v_firm_id
  order by
    case sm.status
      when 'active'::public.membership_status then 0
      when 'suspended'::public.membership_status then 1
      else 2
    end,
    case sm.role
      when 'admin'::public.staff_role then 0
      when 'manager'::public.staff_role then 1
      when 'senior'::public.staff_role then 2
      else 3
    end,
    lower(coalesce(u.email, ''));
end;
$$;

revoke all on function public.list_firm_staff_for_admin() from public;
revoke all on function public.list_firm_staff_for_admin() from anon;
grant execute on function public.list_firm_staff_for_admin() to authenticated;

create or replace function public.admin_update_staff_membership(
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

  if p_status not in ('active'::public.membership_status, 'suspended'::public.membership_status) then
    raise exception 'Staff access may only be active or suspended' using errcode = '22023';
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
    'STAFF_MEMBERSHIP_UPDATED',
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

revoke all on function public.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from public;
revoke all on function public.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) from anon;
grant execute on function public.admin_update_staff_membership(uuid, public.staff_role, public.membership_status) to authenticated;

create or replace function public.service_register_invited_staff(
  p_firm_id uuid,
  p_actor_auth_user_id uuid,
  p_auth_user_id uuid,
  p_role public.staff_role
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_membership_id uuid;
begin
  if not exists (
    select 1
    from public.staff_memberships sm
    where sm.firm_id = p_firm_id
      and sm.auth_user_id = p_actor_auth_user_id
      and sm.role = 'admin'::public.staff_role
      and sm.status = 'active'::public.membership_status
  ) then
    raise exception 'Inviting actor is not an active firm administrator' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception 'Invited auth user does not exist' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.staff_memberships sm
    where sm.auth_user_id = p_auth_user_id
  ) then
    raise exception 'Auth user already has a staff membership' using errcode = '23505';
  end if;

  insert into public.staff_memberships (firm_id, auth_user_id, role, status)
  values (p_firm_id, p_auth_user_id, p_role, 'active'::public.membership_status)
  returning id into v_membership_id;

  insert into public.access_logs (
    firm_id,
    auth_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_firm_id,
    p_actor_auth_user_id,
    'STAFF_INVITED',
    'staff_membership',
    v_membership_id,
    jsonb_build_object(
      'target_auth_user_id', p_auth_user_id,
      'role', p_role,
      'status', 'active'
    )
  );

  return v_membership_id;
end;
$$;

revoke all on function public.service_register_invited_staff(uuid, uuid, uuid, public.staff_role) from public;
revoke all on function public.service_register_invited_staff(uuid, uuid, uuid, public.staff_role) from anon;
revoke all on function public.service_register_invited_staff(uuid, uuid, uuid, public.staff_role) from authenticated;
grant execute on function public.service_register_invited_staff(uuid, uuid, uuid, public.staff_role) to service_role;

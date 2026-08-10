create or replace function public.staff_assign_enquiry(
  p_public_reference text,
  p_actor_user_id uuid,
  p_assign_to_self boolean
)
returns public.enquiries
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_membership public.staff_memberships%rowtype;
  v_previous uuid;
  v_result public.enquiries%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'Verified actor is required';
  end if;

  select * into v_enquiry
  from public.enquiries
  where public_reference = trim(p_public_reference)
  for update;

  if not found then
    raise exception 'Enquiry not found';
  end if;

  select * into v_membership
  from public.staff_memberships
  where firm_id = v_enquiry.firm_id
    and auth_user_id = p_actor_user_id
    and status = 'active'::public.membership_status;

  if not found then
    raise exception 'Firm access denied';
  end if;

  v_previous := v_enquiry.assigned_staff_membership_id;

  if p_assign_to_self then
    if v_previous = v_membership.id then
      raise exception 'Enquiry is already assigned to this staff member';
    end if;

    if v_previous is not null
       and v_previous <> v_membership.id
       and v_membership.role not in (
         'senior'::public.staff_role,
         'manager'::public.staff_role,
         'admin'::public.staff_role
       ) then
      raise exception 'Only senior staff may take over another staff assignment';
    end if;

    update public.enquiries
    set assigned_staff_membership_id = v_membership.id,
        staff_action_at = now(),
        updated_at = now()
    where id = v_enquiry.id
    returning * into v_result;
  else
    if v_previous is null then
      raise exception 'Enquiry is already unassigned';
    end if;

    if v_previous <> v_membership.id
       and v_membership.role not in (
         'senior'::public.staff_role,
         'manager'::public.staff_role,
         'admin'::public.staff_role
       ) then
      raise exception 'Only the assignee or senior staff may unassign this enquiry';
    end if;

    update public.enquiries
    set assigned_staff_membership_id = null,
        staff_action_at = now(),
        updated_at = now()
    where id = v_enquiry.id
    returning * into v_result;
  end if;

  insert into public.audit_events (
    firm_id, enquiry_id, event_type, actor_auth_user_id,
    changed_fields, staff_action_at, configuration_version, metadata
  ) values (
    v_enquiry.firm_id,
    v_enquiry.id,
    'STAFF_ASSIGNMENT_CHANGED',
    p_actor_user_id,
    jsonb_build_object(
      'assigned_staff_membership_id',
      jsonb_build_object(
        'from', case when v_previous is null then null else to_jsonb(v_previous::text) end,
        'to', case when v_result.assigned_staff_membership_id is null then null else to_jsonb(v_result.assigned_staff_membership_id::text) end
      )
    ),
    now(),
    v_enquiry.configuration_version,
    jsonb_build_object('assignment_mode', case when p_assign_to_self then 'SELF' else 'UNASSIGN' end)
  );

  return v_result;
end;
$$;

revoke all on function public.staff_assign_enquiry(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.staff_assign_enquiry(text, uuid, boolean) to service_role;

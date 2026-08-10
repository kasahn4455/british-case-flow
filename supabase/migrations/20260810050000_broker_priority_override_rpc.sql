-- Complete the server-brokered human-priority-override model.
--
-- The previous hardening migration correctly removed browser execution, but the
-- 3-argument function still depended on auth.uid()/auth.jwt(), which are user-session
-- claims and are not available when PostgREST executes the RPC as service_role.
--
-- The browser never supplies p_actor_user_id. A CSRF-protected TanStack server function
-- derives it from the verified Supabase user session after requiring AAL2. This RPC then
-- independently re-checks that actor's active membership/role for the enquiry's firm.

revoke all on function public.override_enquiry_priority(
  uuid,
  public.enquiry_priority,
  text
) from public, anon, authenticated, service_role;

drop function public.override_enquiry_priority(
  uuid,
  public.enquiry_priority,
  text
);

create or replace function public.override_enquiry_priority(
  p_enquiry_id uuid,
  p_new_priority public.enquiry_priority,
  p_reason text,
  p_actor_user_id uuid
)
returns public.enquiries
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_role public.staff_role;
  v_previous public.enquiry_priority;
  v_result public.enquiries%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'Verified actor is required';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Override reason is required';
  end if;

  if char_length(trim(p_reason)) > 1000 then
    raise exception 'Override reason is too long';
  end if;

  select *
  into v_enquiry
  from public.enquiries
  where id = p_enquiry_id
  for update;

  if not found then
    raise exception 'Enquiry not found';
  end if;

  select role
  into v_role
  from public.staff_memberships
  where firm_id = v_enquiry.firm_id
    and auth_user_id = p_actor_user_id
    and status = 'active'::public.membership_status;

  if not found then
    raise exception 'Firm access denied';
  end if;

  v_previous := v_enquiry.priority;
  if p_new_priority = v_previous then
    raise exception 'Priority is unchanged';
  end if;

  if private.priority_rank(p_new_priority) < private.priority_rank(v_previous)
     and v_role not in (
       'senior'::public.staff_role,
       'manager'::public.staff_role,
       'admin'::public.staff_role
     ) then
    raise exception 'Only senior, manager or admin roles may decrease priority';
  end if;

  insert into public.priority_overrides (
    firm_id,
    enquiry_id,
    override_reason,
    overridden_by,
    previous_priority,
    new_priority
  ) values (
    v_enquiry.firm_id,
    v_enquiry.id,
    trim(p_reason),
    p_actor_user_id,
    v_previous,
    p_new_priority
  );

  update public.enquiries
  set priority = p_new_priority,
      priority_reason = 'Human override: ' || trim(p_reason),
      staff_action_at = now(),
      updated_at = now()
  where id = v_enquiry.id
  returning * into v_result;

  insert into public.audit_events (
    firm_id,
    enquiry_id,
    event_type,
    actor_auth_user_id,
    changed_fields,
    priority_assigned,
    priority_reason,
    configuration_version,
    metadata
  ) values (
    v_enquiry.firm_id,
    v_enquiry.id,
    'PRIORITY_OVERRIDE',
    p_actor_user_id,
    jsonb_build_object(
      'priority',
      jsonb_build_object('from', v_previous::text, 'to', p_new_priority::text)
    ),
    p_new_priority,
    trim(p_reason),
    v_enquiry.configuration_version,
    jsonb_build_object(
      'previous_priority', v_previous::text,
      'new_priority', p_new_priority::text
    )
  );

  return v_result;
end;
$$;

revoke all on function public.override_enquiry_priority(
  uuid,
  public.enquiry_priority,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.override_enquiry_priority(
  uuid,
  public.enquiry_priority,
  text,
  uuid
) to service_role;

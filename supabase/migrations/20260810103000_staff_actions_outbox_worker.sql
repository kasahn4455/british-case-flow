-- Audited staff actions + provider-neutral outbox worker primitives.
-- All mutations are brokered by trusted server code using service_role.

create table if not exists public.contact_logs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  enquiry_id uuid not null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('PHONE','EMAIL','SMS','OTHER')),
  direction text not null check (direction in ('INBOUND','OUTBOUND')),
  outcome text not null check (char_length(trim(outcome)) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  contacted_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (enquiry_id, firm_id)
    references public.enquiries(id, firm_id) on delete cascade
);

create index if not exists contact_logs_enquiry_time_idx
  on public.contact_logs(enquiry_id, contacted_at desc);
create index if not exists contact_logs_firm_time_idx
  on public.contact_logs(firm_id, contacted_at desc);

alter table public.contact_logs enable row level security;
revoke all on public.contact_logs from anon, authenticated;
grant select on public.contact_logs to authenticated;

create policy contact_logs_staff_select on public.contact_logs
  for select to authenticated
  using (
    (select private.has_aal2())
    and (select private.has_firm_access(contact_logs.firm_id))
  );

alter table public.outbox_events
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz;

create index if not exists outbox_events_delivery_due_idx
  on public.outbox_events(delivery_status, next_attempt_at, created_at)
  where dead_letter_status = false;

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

create or replace function public.staff_change_enquiry_status(
  p_public_reference text,
  p_new_status public.enquiry_status,
  p_actor_user_id uuid
)
returns public.enquiries
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_previous public.enquiry_status;
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

  if not exists (
    select 1
    from public.staff_memberships sm
    where sm.firm_id = v_enquiry.firm_id
      and sm.auth_user_id = p_actor_user_id
      and sm.status = 'active'::public.membership_status
  ) then
    raise exception 'Firm access denied';
  end if;

  v_previous := v_enquiry.status;
  if p_new_status = v_previous then
    raise exception 'Status is unchanged';
  end if;

  update public.enquiries
  set status = p_new_status,
      staff_action_at = now(),
      updated_at = now()
  where id = v_enquiry.id
  returning * into v_result;

  insert into public.audit_events (
    firm_id, enquiry_id, event_type, actor_auth_user_id,
    changed_fields, staff_action_at, configuration_version, metadata
  ) values (
    v_enquiry.firm_id,
    v_enquiry.id,
    'ENQUIRY_STATUS_CHANGED',
    p_actor_user_id,
    jsonb_build_object(
      'status', jsonb_build_object('from', v_previous::text, 'to', p_new_status::text)
    ),
    now(),
    v_enquiry.configuration_version,
    '{}'::jsonb
  );

  return v_result;
end;
$$;

create or replace function public.staff_log_contact(
  p_public_reference text,
  p_actor_user_id uuid,
  p_channel text,
  p_direction text,
  p_outcome text,
  p_notes text default null,
  p_contacted_at timestamptz default now()
)
returns public.contact_logs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_log public.contact_logs%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'Verified actor is required';
  end if;
  if upper(trim(p_channel)) not in ('PHONE','EMAIL','SMS','OTHER') then
    raise exception 'Invalid contact channel';
  end if;
  if upper(trim(p_direction)) not in ('INBOUND','OUTBOUND') then
    raise exception 'Invalid contact direction';
  end if;
  if char_length(trim(coalesce(p_outcome, ''))) not between 1 and 200 then
    raise exception 'Contact outcome is required';
  end if;
  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'Contact notes are too long';
  end if;
  if p_contacted_at > now() + interval '5 minutes' then
    raise exception 'Contact time cannot be in the future';
  end if;

  select * into v_enquiry
  from public.enquiries
  where public_reference = trim(p_public_reference)
  for update;

  if not found then
    raise exception 'Enquiry not found';
  end if;

  if not exists (
    select 1
    from public.staff_memberships sm
    where sm.firm_id = v_enquiry.firm_id
      and sm.auth_user_id = p_actor_user_id
      and sm.status = 'active'::public.membership_status
  ) then
    raise exception 'Firm access denied';
  end if;

  insert into public.contact_logs (
    firm_id, enquiry_id, actor_auth_user_id,
    channel, direction, outcome, notes, contacted_at
  ) values (
    v_enquiry.firm_id,
    v_enquiry.id,
    p_actor_user_id,
    upper(trim(p_channel)),
    upper(trim(p_direction)),
    trim(p_outcome),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_contacted_at
  ) returning * into v_log;

  update public.enquiries
  set staff_action_at = now(),
      updated_at = now()
  where id = v_enquiry.id;

  insert into public.audit_events (
    firm_id, enquiry_id, event_type, actor_auth_user_id,
    changed_fields, staff_action_at, configuration_version, metadata
  ) values (
    v_enquiry.firm_id,
    v_enquiry.id,
    'CONTACT_LOGGED',
    p_actor_user_id,
    jsonb_build_object('contact_log_id', v_log.id::text),
    now(),
    v_enquiry.configuration_version,
    jsonb_build_object(
      'channel', v_log.channel,
      'direction', v_log.direction,
      'outcome', v_log.outcome,
      'contacted_at', v_log.contacted_at
    )
  );

  return v_log;
end;
$$;

-- Claim due outbox rows atomically. Expired PROCESSING leases become claimable again.
create or replace function public.claim_outbox_events(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 120 then
    raise exception 'Worker id is required';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'Invalid claim limit';
  end if;
  if p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid lease duration';
  end if;

  return query
  with candidates as (
    select oe.event_id
    from public.outbox_events oe
    where oe.dead_letter_status = false
      and (
        (oe.delivery_status in ('PENDING'::public.outbox_delivery_status, 'FAILED'::public.outbox_delivery_status)
          and (oe.next_attempt_at is null or oe.next_attempt_at <= now()))
        or
        (oe.delivery_status = 'PROCESSING'::public.outbox_delivery_status
          and oe.lease_expires_at is not null
          and oe.lease_expires_at <= now())
      )
    order by oe.created_at
    for update skip locked
    limit p_limit
  )
  update public.outbox_events oe
  set delivery_status = 'PROCESSING'::public.outbox_delivery_status,
      retry_count = oe.retry_count + 1,
      last_attempt_at = now(),
      next_attempt_at = null,
      lease_owner = trim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  from candidates c
  where oe.event_id = c.event_id
  returning oe.*;
end;
$$;

create or replace function public.complete_outbox_event(
  p_event_id uuid,
  p_worker_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.outbox_events
  set delivery_status = 'DELIVERED'::public.outbox_delivery_status,
      delivered_at = now(),
      next_attempt_at = null,
      dead_letter_status = false,
      lease_owner = null,
      lease_expires_at = null
  where event_id = p_event_id
    and delivery_status = 'PROCESSING'::public.outbox_delivery_status
    and lease_owner = trim(p_worker_id);

  if not found then
    raise exception 'Outbox claim not found';
  end if;
end;
$$;

create or replace function public.fail_outbox_event(
  p_event_id uuid,
  p_worker_id text,
  p_max_attempts integer default 8
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_retry integer;
begin
  if p_max_attempts not between 1 and 20 then
    raise exception 'Invalid max attempts';
  end if;

  select retry_count into v_retry
  from public.outbox_events
  where event_id = p_event_id
    and delivery_status = 'PROCESSING'::public.outbox_delivery_status
    and lease_owner = trim(p_worker_id)
  for update;

  if not found then
    raise exception 'Outbox claim not found';
  end if;

  update public.outbox_events
  set delivery_status = 'FAILED'::public.outbox_delivery_status,
      dead_letter_status = v_retry >= p_max_attempts,
      next_attempt_at = case
        when v_retry >= p_max_attempts then null
        else now() + make_interval(secs => least(3600, 30 * power(2, least(v_retry - 1, 7)))::integer)
      end,
      lease_owner = null,
      lease_expires_at = null
  where event_id = p_event_id;
end;
$$;

create or replace function public.cleanup_intake_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rate_limits integer;
  v_security_events integer;
begin
  delete from public.intake_rate_limit_windows
  where window_started_at < now() - interval '48 hours';
  get diagnostics v_rate_limits = row_count;

  delete from public.security_events
  where created_at < now() - interval '90 days';
  get diagnostics v_security_events = row_count;

  return jsonb_build_object(
    'rate_limit_windows_deleted', v_rate_limits,
    'security_events_deleted', v_security_events
  );
end;
$$;

revoke all on function public.staff_assign_enquiry(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.staff_change_enquiry_status(text, public.enquiry_status, uuid) from public, anon, authenticated;
revoke all on function public.staff_log_contact(text, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_outbox_events(text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_outbox_event(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_outbox_event(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.cleanup_intake_operational_data() from public, anon, authenticated;

grant execute on function public.staff_assign_enquiry(text, uuid, boolean) to service_role;
grant execute on function public.staff_change_enquiry_status(text, public.enquiry_status, uuid) to service_role;
grant execute on function public.staff_log_contact(text, uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.claim_outbox_events(text, integer, integer) to service_role;
grant execute on function public.complete_outbox_event(uuid, text) to service_role;
grant execute on function public.fail_outbox_event(uuid, text, integer) to service_role;
grant execute on function public.cleanup_intake_operational_data() to service_role;

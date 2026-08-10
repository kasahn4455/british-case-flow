-- Phase 2 backend foundation for Immigration Intake Schema v5.2.
-- This migration deliberately does NOT make the application production-ready.
-- Public submissions enter through the TanStack server route using a server-only Supabase secret key.
-- No anon role is permitted to insert directly into any enquiry table.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

do $$ begin
  create type public.enquiry_priority as enum ('CRITICAL', 'URGENT', 'PRIORITY', 'MANUAL_REVIEW', 'ROUTINE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enquiry_status as enum ('NEW', 'IN_REVIEW', 'CONTACTED', 'AWAITING_CLIENT', 'CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conflict_check_state as enum (
    'CONFLICT_CHECK_PENDING',
    'CONFLICT_CHECK_COMPLETED_BY_FIRM',
    'CONFLICT_CHECK_ESCALATED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_role as enum ('staff', 'senior', 'manager', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active', 'suspended', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outbox_event_type as enum ('ENQUIRY_INTERNAL_ALERT', 'PROSPECT_ACKNOWLEDGEMENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.outbox_delivery_status as enum ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');
exception when duplicate_object then null; end $$;

create table if not exists public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  controller_name text not null check (char_length(controller_name) between 1 and 200),
  privacy_policy_url text not null check (char_length(privacy_policy_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.firm_configurations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version text not null default '5.2' check (schema_version = '5.2'),
  routing_rule_version text not null default 'v5.2',
  timezone text not null default 'Europe/London',
  office_open_time time,
  office_close_time time,
  working_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  uk_bank_holidays_handling text,
  out_of_hours_critical_alert_enabled boolean not null default false,
  critical_sla_minutes integer check (critical_sla_minutes is null or critical_sla_minutes > 0),
  urgent_sla_hours integer check (urgent_sla_hours is null or urgent_sla_hours > 0),
  priority_sla_business_days integer check (priority_sla_business_days is null or priority_sla_business_days > 0),
  manual_review_sla_business_days integer check (manual_review_sla_business_days is null or manual_review_sla_business_days > 0),
  retention_days integer check (retention_days is null or retention_days > 0),
  privacy_notice_version text not null check (char_length(privacy_notice_version) between 1 and 100),
  privacy_notice_url text not null check (char_length(privacy_notice_url) <= 500),
  category_taxonomy jsonb not null default '{}'::jsonb,
  conflict_fields jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  approved_at timestamptz,
  approved_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (firm_id, version),
  unique (id, firm_id)
);

create unique index if not exists firm_configurations_one_active_per_firm
  on public.firm_configurations(firm_id) where is_active;

create table if not exists public.published_forms (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  configuration_id uuid not null,
  published_form_id text not null unique check (char_length(published_form_id) between 24 and 160),
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (id, firm_id),
  foreign key (configuration_id, firm_id)
    references public.firm_configurations(id, firm_id) on delete restrict
);

create table if not exists public.staff_memberships (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role public.staff_role not null default 'staff',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, auth_user_id),
  unique (id, firm_id)
);

create table if not exists public.submission_snapshots (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  published_form_id uuid not null,
  schema_version text not null check (schema_version = '5.2'),
  submission_hash text not null check (submission_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (id, firm_id),
  foreign key (published_form_id, firm_id)
    references public.published_forms(id, firm_id) on delete restrict
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  firm_id uuid not null references public.firms(id) on delete cascade,
  published_form_id uuid not null,
  submission_snapshot_id uuid not null,
  configuration_id uuid not null,
  configuration_version integer not null,
  schema_version text not null check (schema_version = '5.2'),
  routing_rule_version text not null,
  submitted_at timestamptz not null default now(),

  full_name text not null check (char_length(full_name) between 1 and 150),
  email text not null check (char_length(email) between 1 and 254),
  phone text not null check (char_length(phone) between 1 and 20),
  preferred_contact_method text not null,
  preferred_contact_time text,
  category text not null,
  location_status text not null,
  intake_answers jsonb not null,

  priority public.enquiry_priority not null,
  priority_reason text not null,
  matched_rule_ids text[] not null default '{}'::text[],
  status public.enquiry_status not null default 'NEW',
  conflict_check_state public.conflict_check_state not null default 'CONFLICT_CHECK_PENDING',
  assigned_staff_membership_id uuid,
  staff_opened_at timestamptz,
  staff_action_at timestamptz,
  followup_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, firm_id),
  foreign key (published_form_id, firm_id)
    references public.published_forms(id, firm_id) on delete restrict,
  foreign key (submission_snapshot_id, firm_id)
    references public.submission_snapshots(id, firm_id) on delete restrict,
  foreign key (configuration_id, firm_id)
    references public.firm_configurations(id, firm_id) on delete restrict,
  foreign key (assigned_staff_membership_id, firm_id)
    references public.staff_memberships(id, firm_id) on delete restrict
);

create table if not exists public.routing_results (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null,
  firm_id uuid not null,
  priority public.enquiry_priority not null,
  matched_rule_ids text[] not null,
  priority_reason text not null,
  derived_facts jsonb not null,
  routing_rule_version text not null,
  evaluated_at timestamptz not null default now(),
  unique (enquiry_id),
  foreign key (enquiry_id, firm_id)
    references public.enquiries(id, firm_id) on delete cascade
);

create table if not exists public.outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  enquiry_id uuid not null,
  event_type public.outbox_event_type not null,
  idempotency_key text not null unique,
  payload jsonb not null,
  delivery_status public.outbox_delivery_status not null default 'PENDING',
  retry_count integer not null default 0 check (retry_count >= 0),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  dead_letter_status boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (enquiry_id, firm_id)
    references public.enquiries(id, firm_id) on delete cascade
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  enquiry_id uuid not null,
  event_type text not null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  submission_snapshot_id uuid,
  submission_hash text,
  schema_version text,
  changed_fields jsonb not null default '{}'::jsonb,
  routing_rule_version text,
  matched_rule_ids text[],
  priority_assigned public.enquiry_priority,
  priority_reason text,
  internal_alert_event_id uuid references public.outbox_events(event_id) on delete set null,
  acknowledgement_event_id uuid references public.outbox_events(event_id) on delete set null,
  staff_opened_at timestamptz,
  staff_action_at timestamptz,
  followup_sent_at timestamptz,
  configuration_version integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (enquiry_id, firm_id)
    references public.enquiries(id, firm_id) on delete cascade
);

create table if not exists public.priority_overrides (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  enquiry_id uuid not null,
  override_reason text not null check (char_length(trim(override_reason)) between 10 and 1000),
  overridden_by uuid not null references auth.users(id) on delete restrict,
  previous_priority public.enquiry_priority not null,
  new_priority public.enquiry_priority not null,
  created_at timestamptz not null default now(),
  foreign key (enquiry_id, firm_id)
    references public.enquiries(id, firm_id) on delete cascade
);

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists staff_memberships_user_idx on public.staff_memberships(auth_user_id, status);
create index if not exists published_forms_firm_idx on public.published_forms(firm_id, status);
create index if not exists enquiries_firm_submitted_idx on public.enquiries(firm_id, submitted_at desc);
create index if not exists enquiries_firm_priority_idx on public.enquiries(firm_id, priority, status);
create index if not exists routing_results_firm_idx on public.routing_results(firm_id, evaluated_at desc);
create index if not exists outbox_pending_idx on public.outbox_events(delivery_status, next_attempt_at, created_at)
  where delivery_status in ('PENDING', 'FAILED') and dead_letter_status = false;
create index if not exists audit_events_firm_enquiry_idx on public.audit_events(firm_id, enquiry_id, created_at desc);
create index if not exists access_logs_firm_idx on public.access_logs(firm_id, occurred_at desc);

create or replace function private.has_aal2()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;

create or replace function private.has_firm_access(p_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.staff_memberships sm
    where sm.firm_id = p_firm_id
      and sm.auth_user_id = auth.uid()
      and sm.status = 'active'::public.membership_status
  );
$$;

create or replace function private.has_firm_role(p_firm_id uuid, p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.staff_memberships sm
    where sm.firm_id = p_firm_id
      and sm.auth_user_id = auth.uid()
      and sm.status = 'active'::public.membership_status
      and sm.role = any(p_roles)
  );
$$;

create or replace function private.priority_rank(p_priority public.enquiry_priority)
returns integer
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case p_priority
    when 'CRITICAL'::public.enquiry_priority then 5
    when 'URGENT'::public.enquiry_priority then 4
    when 'PRIORITY'::public.enquiry_priority then 3
    when 'MANUAL_REVIEW'::public.enquiry_priority then 2
    when 'ROUTINE'::public.enquiry_priority then 1
  end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.has_aal2() to authenticated;
grant execute on function private.has_firm_access(uuid) to authenticated;
grant execute on function private.has_firm_role(uuid, public.staff_role[]) to authenticated;

alter table public.firms enable row level security;
alter table public.firm_configurations enable row level security;
alter table public.published_forms enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.submission_snapshots enable row level security;
alter table public.enquiries enable row level security;
alter table public.routing_results enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.priority_overrides enable row level security;
alter table public.access_logs enable row level security;

revoke all on table public.firms from anon, authenticated;
revoke all on table public.firm_configurations from anon, authenticated;
revoke all on table public.published_forms from anon, authenticated;
revoke all on table public.staff_memberships from anon, authenticated;
revoke all on table public.submission_snapshots from anon, authenticated;
revoke all on table public.enquiries from anon, authenticated;
revoke all on table public.routing_results from anon, authenticated;
revoke all on table public.outbox_events from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;
revoke all on table public.priority_overrides from anon, authenticated;
revoke all on table public.access_logs from anon, authenticated;

grant select on table public.firms to authenticated;
grant select on table public.firm_configurations to authenticated;
grant select on table public.published_forms to authenticated;
grant select on table public.staff_memberships to authenticated;
grant select on table public.enquiries to authenticated;
grant select on table public.routing_results to authenticated;
grant select on table public.priority_overrides to authenticated;
grant select on table public.audit_events to authenticated;
grant select on table public.access_logs to authenticated;

create policy firms_staff_select on public.firms
for select to authenticated
using ((select private.has_aal2()) and (select private.has_firm_access(id)));

create policy firm_configurations_staff_select on public.firm_configurations
for select to authenticated
using ((select private.has_aal2()) and (select private.has_firm_access(firm_id)));

create policy published_forms_staff_select on public.published_forms
for select to authenticated
using ((select private.has_aal2()) and (select private.has_firm_access(firm_id)));

create policy staff_memberships_self_or_manager_select on public.staff_memberships
for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or (
    (select private.has_aal2())
    and (select private.has_firm_role(firm_id, array['manager','admin']::public.staff_role[]))
  )
);

create policy enquiries_staff_select on public.enquiries
for select to authenticated
using ((select private.has_aal2()) and (select private.has_firm_access(firm_id)));

create policy routing_results_staff_select on public.routing_results
for select to authenticated
using ((select private.has_aal2()) and (select private.has_firm_access(firm_id)));

create policy priority_overrides_staff_select on public.priority_overrides
for select to authenticated
using ((select private.has_aal2()) and (select private.has_firm_access(firm_id)));

create policy audit_events_staff_select on public.audit_events
for select to authenticated
using ((select private.has_aal2()) and (select private.has_firm_access(firm_id)));

create policy access_logs_manager_select on public.access_logs
for select to authenticated
using (
  (select private.has_aal2())
  and (select private.has_firm_role(firm_id, array['manager','admin']::public.staff_role[]))
);

-- No authenticated or anon policy is intentionally created for submission_snapshots or outbox_events.
-- They are server/worker-only in v1.

create or replace function public.persist_intake_submission_v52(
  p_published_form_id text,
  p_submission jsonb,
  p_submission_hash text,
  p_derived_facts jsonb,
  p_priority public.enquiry_priority,
  p_matched_rule_ids text[],
  p_priority_reason text,
  p_schema_version text,
  p_routing_rule_version text
)
returns table (enquiry_id uuid, enquiry_reference text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_form public.published_forms%rowtype;
  v_config public.firm_configurations%rowtype;
  v_firm public.firms%rowtype;
  v_snapshot_id uuid := gen_random_uuid();
  v_enquiry_id uuid := gen_random_uuid();
  v_reference text;
  v_internal_event_id uuid := gen_random_uuid();
  v_ack_event_id uuid := gen_random_uuid();
  v_submitted_at timestamptz := now();
begin
  if p_schema_version <> '5.2' then
    raise exception 'Unsupported schema version';
  end if;
  if p_submission_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid submission hash';
  end if;
  if coalesce(array_length(p_matched_rule_ids, 1), 0) = 0 then
    raise exception 'Matched rule IDs are required';
  end if;

  select * into v_form
  from public.published_forms
  where published_form_id = p_published_form_id
    and status = 'active'
  for share;
  if not found then
    raise exception 'Published form is not active';
  end if;

  select * into v_config
  from public.firm_configurations
  where id = v_form.configuration_id
    and firm_id = v_form.firm_id
    and is_active = true;
  if not found then
    raise exception 'Active configuration is not available';
  end if;

  select * into v_firm from public.firms where id = v_form.firm_id;
  if not found then
    raise exception 'Firm is not available';
  end if;

  -- Privacy evidence is configuration-owned, not client-authoritative.
  if p_submission->>'privacy_notice_version' is distinct from v_config.privacy_notice_version
     or p_submission->>'privacy_notice_url' is distinct from v_config.privacy_notice_url then
    raise exception 'Privacy notice version does not match the active form configuration';
  end if;

  v_reference := 'IM-' || upper(substr(replace(v_enquiry_id::text, '-', ''), 1, 10));

  insert into public.submission_snapshots (
    id, firm_id, published_form_id, schema_version, submission_hash, payload, created_at
  ) values (
    v_snapshot_id,
    v_form.firm_id,
    v_form.id,
    p_schema_version,
    p_submission_hash,
    p_submission - 'website',
    v_submitted_at
  );

  insert into public.enquiries (
    id,
    public_reference,
    firm_id,
    published_form_id,
    submission_snapshot_id,
    configuration_id,
    configuration_version,
    schema_version,
    routing_rule_version,
    submitted_at,
    full_name,
    email,
    phone,
    preferred_contact_method,
    preferred_contact_time,
    category,
    location_status,
    intake_answers,
    priority,
    priority_reason,
    matched_rule_ids,
    status,
    conflict_check_state,
    created_at,
    updated_at
  ) values (
    v_enquiry_id,
    v_reference,
    v_form.firm_id,
    v_form.id,
    v_snapshot_id,
    v_config.id,
    v_config.version,
    p_schema_version,
    p_routing_rule_version,
    v_submitted_at,
    p_submission->>'full_name',
    p_submission->>'email',
    p_submission->>'phone',
    p_submission->>'preferred_contact_method',
    nullif(p_submission->>'preferred_contact_time', ''),
    p_submission->>'category',
    p_submission->>'location_status',
    p_submission - 'website',
    p_priority,
    p_priority_reason,
    p_matched_rule_ids,
    'NEW'::public.enquiry_status,
    'CONFLICT_CHECK_PENDING'::public.conflict_check_state,
    v_submitted_at,
    v_submitted_at
  );

  insert into public.routing_results (
    enquiry_id, firm_id, priority, matched_rule_ids, priority_reason, derived_facts,
    routing_rule_version, evaluated_at
  ) values (
    v_enquiry_id, v_form.firm_id, p_priority, p_matched_rule_ids, p_priority_reason,
    p_derived_facts, p_routing_rule_version, v_submitted_at
  );

  insert into public.outbox_events (
    event_id, firm_id, enquiry_id, event_type, idempotency_key, payload, delivery_status, created_at
  ) values (
    v_internal_event_id,
    v_form.firm_id,
    v_enquiry_id,
    'ENQUIRY_INTERNAL_ALERT'::public.outbox_event_type,
    v_enquiry_id::text || ':internal-alert:v1',
    jsonb_build_object(
      'enquiry_reference', v_reference,
      'priority', p_priority::text,
      'message', p_priority::text || ' new enquiry — #' || v_reference || '. Secure review required.'
    ),
    'PENDING'::public.outbox_delivery_status,
    v_submitted_at
  );

  insert into public.outbox_events (
    event_id, firm_id, enquiry_id, event_type, idempotency_key, payload, delivery_status, created_at
  ) values (
    v_ack_event_id,
    v_form.firm_id,
    v_enquiry_id,
    'PROSPECT_ACKNOWLEDGEMENT'::public.outbox_event_type,
    v_enquiry_id::text || ':prospect-ack:v1',
    jsonb_build_object(
      'enquiry_reference', v_reference,
      'recipient_email', p_submission->>'email',
      'recipient_phone', p_submission->>'phone',
      'preferred_contact_method', p_submission->>'preferred_contact_method',
      'message_paragraphs', jsonb_build_array(
        'Thank you for contacting ' || v_firm.name || '. We have received your enquiry and will review the information provided.',
        'Submitting this form does not mean that ' || v_firm.name || ' has agreed to act for you. Please do not assume that any immigration or tribunal deadline has been protected until the firm confirms this expressly.',
        'If you believe you have an urgent deadline and have not already provided it above, please contact the firm directly and immediately.'
      )
    ),
    'PENDING'::public.outbox_delivery_status,
    v_submitted_at
  );

  insert into public.audit_events (
    firm_id,
    enquiry_id,
    event_type,
    submitted_at,
    submission_snapshot_id,
    submission_hash,
    schema_version,
    changed_fields,
    routing_rule_version,
    matched_rule_ids,
    priority_assigned,
    priority_reason,
    internal_alert_event_id,
    acknowledgement_event_id,
    configuration_version,
    metadata,
    created_at
  ) values (
    v_form.firm_id,
    v_enquiry_id,
    'SUBMISSION_ROUTED',
    v_submitted_at,
    v_snapshot_id,
    p_submission_hash,
    p_schema_version,
    '{}'::jsonb,
    p_routing_rule_version,
    p_matched_rule_ids,
    p_priority,
    p_priority_reason,
    v_internal_event_id,
    v_ack_event_id,
    v_config.version,
    jsonb_build_object('timezone', 'Europe/London'),
    v_submitted_at
  );

  return query select v_enquiry_id, v_reference;
end;
$$;

revoke all on function public.persist_intake_submission_v52(
  text, jsonb, text, jsonb, public.enquiry_priority, text[], text, text, text
) from public, anon, authenticated;
grant execute on function public.persist_intake_submission_v52(
  text, jsonb, text, jsonb, public.enquiry_priority, text[], text, text, text
) to service_role;

create or replace function public.override_enquiry_priority(
  p_enquiry_id uuid,
  p_new_priority public.enquiry_priority,
  p_reason text
)
returns public.enquiries
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_enquiry public.enquiries%rowtype;
  v_role public.staff_role;
  v_previous public.enquiry_priority;
  v_result public.enquiries%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then raise exception 'MFA assurance level 2 required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'Override reason is required'; end if;

  select * into v_enquiry from public.enquiries where id = p_enquiry_id for update;
  if not found then raise exception 'Enquiry not found'; end if;

  select role into v_role
  from public.staff_memberships
  where firm_id = v_enquiry.firm_id
    and auth_user_id = v_uid
    and status = 'active'::public.membership_status;
  if not found then raise exception 'Firm access denied'; end if;

  v_previous := v_enquiry.priority;
  if p_new_priority = v_previous then raise exception 'Priority is unchanged'; end if;

  if private.priority_rank(p_new_priority) < private.priority_rank(v_previous)
     and v_role not in ('senior'::public.staff_role, 'manager'::public.staff_role, 'admin'::public.staff_role) then
    raise exception 'Only designated senior or manager roles may decrease priority';
  end if;

  insert into public.priority_overrides (
    firm_id, enquiry_id, override_reason, overridden_by, previous_priority, new_priority
  ) values (
    v_enquiry.firm_id, v_enquiry.id, trim(p_reason), v_uid, v_previous, p_new_priority
  );

  update public.enquiries
  set priority = p_new_priority,
      priority_reason = 'Human override: ' || trim(p_reason),
      staff_action_at = now(),
      updated_at = now()
  where id = v_enquiry.id
  returning * into v_result;

  insert into public.audit_events (
    firm_id, enquiry_id, event_type, actor_auth_user_id, changed_fields,
    priority_assigned, priority_reason, configuration_version, metadata
  ) values (
    v_enquiry.firm_id,
    v_enquiry.id,
    'PRIORITY_OVERRIDE',
    v_uid,
    jsonb_build_object('priority', jsonb_build_object('from', v_previous::text, 'to', p_new_priority::text)),
    p_new_priority,
    trim(p_reason),
    v_enquiry.configuration_version,
    jsonb_build_object('previous_priority', v_previous::text, 'new_priority', p_new_priority::text)
  );

  return v_result;
end;
$$;

revoke all on function public.override_enquiry_priority(uuid, public.enquiry_priority, text) from public, anon;
grant execute on function public.override_enquiry_priority(uuid, public.enquiry_priority, text) to authenticated;

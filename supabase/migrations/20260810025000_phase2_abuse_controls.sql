-- Durable public-intake abuse controls.
-- These controls protect transport/submission behavior only. They never cap or downgrade
-- otherwise-valid CRITICAL enquiries based on firm-wide critical volume.

alter table public.firm_configurations
  add column if not exists rate_limit_window_seconds integer not null default 600
    check (rate_limit_window_seconds between 60 and 86400),
  add column if not exists rate_limit_ip_max integer not null default 30
    check (rate_limit_ip_max between 1 and 10000),
  add column if not exists rate_limit_session_max integer not null default 12
    check (rate_limit_session_max between 1 and 10000),
  add column if not exists critical_volume_security_window_seconds integer not null default 3600
    check (critical_volume_security_window_seconds between 60 and 86400),
  add column if not exists critical_volume_security_threshold integer not null default 20
    check (critical_volume_security_threshold between 2 and 100000);

create table if not exists public.intake_rate_limit_windows (
  firm_id uuid not null references public.firms(id) on delete cascade,
  published_form_id uuid not null,
  key_kind text not null check (key_kind in ('ip', 'session')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count >= 1),
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (published_form_id, key_kind, key_hash, window_started_at),
  foreign key (published_form_id, firm_id)
    references public.published_forms(id, firm_id) on delete cascade
);

create index if not exists intake_rate_limit_cleanup_idx
  on public.intake_rate_limit_windows(window_started_at);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  event_type text not null check (event_type in ('RATE_LIMIT_TRIGGERED', 'HIGH_VOLUME_CRITICAL')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  scope_hash text not null default '',
  window_started_at timestamptz not null,
  observed_count integer not null check (observed_count >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, event_type, scope_hash, window_started_at)
);

create index if not exists security_events_firm_created_idx
  on public.security_events(firm_id, created_at desc);

alter table public.intake_rate_limit_windows enable row level security;
alter table public.security_events enable row level security;

revoke all on table public.intake_rate_limit_windows from anon, authenticated;
revoke all on table public.security_events from anon, authenticated;
grant select on table public.security_events to authenticated;

create policy security_events_manager_select on public.security_events
for select to authenticated
using (
  (select private.has_aal2())
  and (select private.has_firm_role(firm_id, array['manager','admin']::public.staff_role[]))
);

create or replace function public.check_intake_rate_limits_v1(
  p_published_form_id text,
  p_ip_hash text,
  p_session_hash text,
  p_now timestamptz default now()
)
returns table (form_available boolean, allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_form public.published_forms%rowtype;
  v_config public.firm_configurations%rowtype;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_ip_count integer;
  v_session_count integer;
  v_allowed boolean;
  v_retry integer := 0;
  v_scope_hash text;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid pseudonymous rate-limit key';
  end if;

  select * into v_form
  from public.published_forms
  where published_form_id = p_published_form_id
    and status = 'active';

  if not found then
    return query select false, false, 0;
    return;
  end if;

  select * into v_config
  from public.firm_configurations
  where id = v_form.configuration_id
    and firm_id = v_form.firm_id
    and is_active = true;

  if not found then
    return query select false, false, 0;
    return;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / v_config.rate_limit_window_seconds)
    * v_config.rate_limit_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => v_config.rate_limit_window_seconds);

  insert into public.intake_rate_limit_windows (
    firm_id, published_form_id, key_kind, key_hash, window_started_at,
    request_count, last_seen_at, created_at
  ) values (
    v_form.firm_id, v_form.id, 'ip', p_ip_hash, v_window_start, 1, p_now, p_now
  )
  on conflict (published_form_id, key_kind, key_hash, window_started_at)
  do update set
    request_count = public.intake_rate_limit_windows.request_count + 1,
    last_seen_at = excluded.last_seen_at
  returning request_count into v_ip_count;

  insert into public.intake_rate_limit_windows (
    firm_id, published_form_id, key_kind, key_hash, window_started_at,
    request_count, last_seen_at, created_at
  ) values (
    v_form.firm_id, v_form.id, 'session', p_session_hash, v_window_start, 1, p_now, p_now
  )
  on conflict (published_form_id, key_kind, key_hash, window_started_at)
  do update set
    request_count = public.intake_rate_limit_windows.request_count + 1,
    last_seen_at = excluded.last_seen_at
  returning request_count into v_session_count;

  v_allowed :=
    v_ip_count <= v_config.rate_limit_ip_max
    and v_session_count <= v_config.rate_limit_session_max;

  if not v_allowed then
    v_retry := greatest(1, ceil(extract(epoch from (v_window_end - p_now)))::integer);
    v_scope_hash := case
      when v_ip_count > v_config.rate_limit_ip_max then p_ip_hash
      else p_session_hash
    end;

    insert into public.security_events (
      firm_id, event_type, severity, scope_hash, window_started_at,
      observed_count, metadata, created_at, updated_at
    ) values (
      v_form.firm_id,
      'RATE_LIMIT_TRIGGERED',
      'warning',
      v_scope_hash,
      v_window_start,
      greatest(v_ip_count, v_session_count),
      jsonb_build_object(
        'published_form_id', p_published_form_id,
        'ip_limit_exceeded', v_ip_count > v_config.rate_limit_ip_max,
        'session_limit_exceeded', v_session_count > v_config.rate_limit_session_max
      ),
      p_now,
      p_now
    )
    on conflict (firm_id, event_type, scope_hash, window_started_at)
    do update set
      observed_count = greatest(public.security_events.observed_count, excluded.observed_count),
      metadata = excluded.metadata,
      updated_at = excluded.updated_at;
  end if;

  return query select true, v_allowed, v_retry;
end;
$$;

revoke all on function public.check_intake_rate_limits_v1(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.check_intake_rate_limits_v1(text, text, text, timestamptz)
  to service_role;

-- Replace atomic persistence with race-safe duplicate suppression plus non-blocking
-- high-volume CRITICAL security-event recording.
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
  v_duplicate_enquiry_id uuid;
  v_duplicate_reference text;
  v_critical_count integer;
  v_security_window_start timestamptz;
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

  if p_submission->>'privacy_notice_version' is distinct from v_config.privacy_notice_version
     or p_submission->>'privacy_notice_url' is distinct from v_config.privacy_notice_url then
    raise exception 'Privacy notice version does not match the active form configuration';
  end if;

  -- Serialize identical submissions for this form before checking the recent window.
  -- This stops concurrent double-click/retry requests from creating duplicate enquiries/outbox events.
  perform pg_advisory_xact_lock(
    hashtextextended(v_form.id::text || ':' || p_submission_hash, 0)
  );

  select e.id, e.public_reference
    into v_duplicate_enquiry_id, v_duplicate_reference
  from public.submission_snapshots s
  join public.enquiries e
    on e.submission_snapshot_id = s.id
   and e.firm_id = s.firm_id
  where s.published_form_id = v_form.id
    and s.submission_hash = p_submission_hash
    and s.created_at >= v_submitted_at - interval '10 minutes'
  order by s.created_at desc
  limit 1;

  if found then
    return query select v_duplicate_enquiry_id, v_duplicate_reference;
    return;
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

  if p_priority = 'CRITICAL'::public.enquiry_priority then
    select count(*)::integer into v_critical_count
    from public.enquiries
    where firm_id = v_form.firm_id
      and priority = 'CRITICAL'::public.enquiry_priority
      and submitted_at >= v_submitted_at - make_interval(
        secs => v_config.critical_volume_security_window_seconds
      );

    if v_critical_count >= v_config.critical_volume_security_threshold then
      v_security_window_start := to_timestamp(
        floor(
          extract(epoch from v_submitted_at)
          / v_config.critical_volume_security_window_seconds
        ) * v_config.critical_volume_security_window_seconds
      );

      insert into public.security_events (
        firm_id, event_type, severity, scope_hash, window_started_at,
        observed_count, metadata, created_at, updated_at
      ) values (
        v_form.firm_id,
        'HIGH_VOLUME_CRITICAL',
        'warning',
        '',
        v_security_window_start,
        v_critical_count,
        jsonb_build_object(
          'window_seconds', v_config.critical_volume_security_window_seconds,
          'threshold', v_config.critical_volume_security_threshold
        ),
        v_submitted_at,
        v_submitted_at
      )
      on conflict (firm_id, event_type, scope_hash, window_started_at)
      do update set
        observed_count = greatest(public.security_events.observed_count, excluded.observed_count),
        metadata = excluded.metadata,
        updated_at = excluded.updated_at;
    end if;
  end if;

  return query select v_enquiry_id, v_reference;
end;
$$;

revoke all on function public.persist_intake_submission_v52(
  text, jsonb, text, jsonb, public.enquiry_priority, text[], text, text, text
) from public, anon, authenticated;
grant execute on function public.persist_intake_submission_v52(
  text, jsonb, text, jsonb, public.enquiry_priority, text[], text, text, text
) to service_role;

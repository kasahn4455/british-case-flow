create extension if not exists pgtap with schema extensions;

begin;

select plan(23);

select has_table('public', 'intake_rate_limit_windows', 'rate-limit window table exists');
select has_table('public', 'security_events', 'security events table exists');
select has_column('public', 'firm_configurations', 'rate_limit_window_seconds', 'rate-limit window is configurable');
select has_column('public', 'firm_configurations', 'rate_limit_ip_max', 'IP rate limit is configurable');
select has_column('public', 'firm_configurations', 'rate_limit_session_max', 'session rate limit is configurable');
select has_column(
  'public',
  'firm_configurations',
  'critical_volume_security_threshold',
  'critical-volume security threshold is configurable'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.intake_rate_limit_windows'::regclass),
  'RLS is enabled on rate-limit windows'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.security_events'::regclass),
  'RLS is enabled on security events'
);
select ok(
  not has_table_privilege('anon', 'public.intake_rate_limit_windows', 'SELECT'),
  'anon cannot read pseudonymous rate-limit state'
);
select ok(
  not has_table_privilege('authenticated', 'public.intake_rate_limit_windows', 'SELECT'),
  'staff cannot directly read pseudonymous rate-limit state'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.check_intake_rate_limits_v1(text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'service role can execute durable rate-limit RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.check_intake_rate_limits_v1(text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'anon cannot execute durable rate-limit RPC directly'
);

insert into public.firms (
  id, name, slug, controller_name, privacy_policy_url
) values (
  '11000000-0000-0000-0000-000000000001',
  'Abuse Control Test Solicitors',
  'abuse-control-test-solicitors',
  'Abuse Control Test Solicitors',
  'https://example.test/privacy'
);

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at,
  rate_limit_window_seconds, rate_limit_ip_max, rate_limit_session_max,
  critical_volume_security_window_seconds, critical_volume_security_threshold
) values (
  '21000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  1,
  '5.2',
  'v5.2',
  'abuse-v1',
  'https://example.test/privacy',
  true,
  now(),
  600,
  2,
  2,
  3600,
  2
);

insert into public.published_forms (
  id, firm_id, configuration_id, published_form_id, status
) values (
  '31000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'form_abuse_control_abcdefghijkl',
  'active'
);

create temporary table rate_results (
  seq integer generated always as identity,
  form_available boolean,
  allowed boolean,
  retry_after_seconds integer
) on commit drop;

insert into rate_results (form_available, allowed, retry_after_seconds)
select * from public.check_intake_rate_limits_v1(
  'form_abuse_control_abcdefghijkl', repeat('a', 64), repeat('b', 64), '2026-08-10T12:00:00Z'
);
insert into rate_results (form_available, allowed, retry_after_seconds)
select * from public.check_intake_rate_limits_v1(
  'form_abuse_control_abcdefghijkl', repeat('a', 64), repeat('b', 64), '2026-08-10T12:00:01Z'
);
insert into rate_results (form_available, allowed, retry_after_seconds)
select * from public.check_intake_rate_limits_v1(
  'form_abuse_control_abcdefghijkl', repeat('a', 64), repeat('b', 64), '2026-08-10T12:00:02Z'
);

select is((select allowed from rate_results where seq = 1), true, 'first request is allowed');
select is((select allowed from rate_results where seq = 2), true, 'request at configured limit is allowed');
select is((select allowed from rate_results where seq = 3), false, 'request over configured limit is blocked');
select ok(
  (select retry_after_seconds from rate_results where seq = 3) > 0,
  'blocked request returns a positive retry-after interval'
);
select is(
  (select count(*)::integer from public.security_events where event_type = 'RATE_LIMIT_TRIGGERED'),
  1,
  'rate-limit trigger creates one deduplicated security event'
);
select ok(
  not exists (
    select 1 from public.security_events
    where event_type = 'RATE_LIMIT_TRIGGERED'
      and metadata::text like '%203.0.113.%'
  ),
  'rate-limit security metadata contains no raw IP address'
);

create temporary table duplicate_refs (
  seq integer generated always as identity,
  enquiry_id uuid,
  enquiry_reference text
) on commit drop;

insert into duplicate_refs (enquiry_id, enquiry_reference)
select * from public.persist_intake_submission_v52(
  'form_abuse_control_abcdefghijkl',
  '{
    "full_name":"Duplicate Demo",
    "email":"duplicate@example.test",
    "phone":"+442079460812",
    "preferred_contact_method":"Email",
    "category":"Making a new application",
    "location_status":"Inside the UK",
    "urgency_flags":["none"],
    "past_date_confirmations":{},
    "existing_representative":"No",
    "privacy_notice_version":"abuse-v1",
    "privacy_notice_url":"https://example.test/privacy",
    "privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"
  }'::jsonb,
  repeat('d', 64),
  '{
    "effective_decision_received":false,
    "effective_detained":false,
    "effective_removal_date":false,
    "detention_category_unresolved":false,
    "location_uncertain":false
  }'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

insert into duplicate_refs (enquiry_id, enquiry_reference)
select * from public.persist_intake_submission_v52(
  'form_abuse_control_abcdefghijkl',
  '{
    "full_name":"Duplicate Demo",
    "email":"duplicate@example.test",
    "phone":"+442079460812",
    "preferred_contact_method":"Email",
    "category":"Making a new application",
    "location_status":"Inside the UK",
    "urgency_flags":["none"],
    "past_date_confirmations":{},
    "existing_representative":"No",
    "privacy_notice_version":"abuse-v1",
    "privacy_notice_url":"https://example.test/privacy",
    "privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"
  }'::jsonb,
  repeat('d', 64),
  '{
    "effective_decision_received":false,
    "effective_detained":false,
    "effective_removal_date":false,
    "detention_category_unresolved":false,
    "location_uncertain":false
  }'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

select is(
  (select count(distinct enquiry_reference)::integer from duplicate_refs),
  1,
  'identical retry returns the existing enquiry reference'
);
select is(
  (select count(*)::integer from public.enquiries where firm_id = '11000000-0000-0000-0000-000000000001'),
  1,
  'identical retry creates only one enquiry'
);
select is(
  (select count(*)::integer from public.outbox_events where firm_id = '11000000-0000-0000-0000-000000000001'),
  2,
  'identical retry creates no duplicate outbox events'
);

-- Two different CRITICAL enquiries cross the configured security threshold. Both must
-- persist normally; the threshold only records a separate security event.
select * from public.persist_intake_submission_v52(
  'form_abuse_control_abcdefghijkl',
  '{
    "full_name":"Critical One",
    "email":"critical1@example.test",
    "phone":"+442079460813",
    "preferred_contact_method":"Email",
    "category":"Detention / removal enquiry",
    "location_status":"Inside the UK",
    "urgency_flags":["detained"],
    "currently_detained":"Yes",
    "removal_date_given":"No",
    "past_date_confirmations":{},
    "existing_representative":"No",
    "privacy_notice_version":"abuse-v1",
    "privacy_notice_url":"https://example.test/privacy",
    "privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"
  }'::jsonb,
  repeat('e', 64),
  '{
    "effective_decision_received":false,
    "effective_detained":true,
    "effective_removal_date":false,
    "detention_category_unresolved":false,
    "location_uncertain":false
  }'::jsonb,
  'CRITICAL'::public.enquiry_priority,
  array['CRITICAL_DETAINED']::text[],
  'Highest severity matched: CRITICAL_DETAINED',
  '5.2',
  'v5.2'
);

select * from public.persist_intake_submission_v52(
  'form_abuse_control_abcdefghijkl',
  '{
    "full_name":"Critical Two",
    "email":"critical2@example.test",
    "phone":"+442079460814",
    "preferred_contact_method":"Email",
    "category":"Detention / removal enquiry",
    "location_status":"Inside the UK",
    "urgency_flags":["detained"],
    "currently_detained":"Yes",
    "removal_date_given":"No",
    "past_date_confirmations":{},
    "existing_representative":"No",
    "privacy_notice_version":"abuse-v1",
    "privacy_notice_url":"https://example.test/privacy",
    "privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"
  }'::jsonb,
  repeat('f', 64),
  '{
    "effective_decision_received":false,
    "effective_detained":true,
    "effective_removal_date":false,
    "detention_category_unresolved":false,
    "location_uncertain":false
  }'::jsonb,
  'CRITICAL'::public.enquiry_priority,
  array['CRITICAL_DETAINED']::text[],
  'Highest severity matched: CRITICAL_DETAINED',
  '5.2',
  'v5.2'
);

select is(
  (
    select count(*)::integer
    from public.enquiries
    where firm_id = '11000000-0000-0000-0000-000000000001'
      and priority = 'CRITICAL'::public.enquiry_priority
  ),
  2,
  'high CRITICAL volume does not block otherwise-valid CRITICAL enquiries'
);
select is(
  (
    select count(*)::integer
    from public.security_events
    where firm_id = '11000000-0000-0000-0000-000000000001'
      and event_type = 'HIGH_VOLUME_CRITICAL'
  ),
  1,
  'high CRITICAL volume creates a separate deduplicated security event'
);

select * from finish();
rollback;

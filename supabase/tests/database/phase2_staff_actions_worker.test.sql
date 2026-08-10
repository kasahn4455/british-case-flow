create extension if not exists pgtap with schema extensions;

begin;
select plan(28);

select has_table('public', 'contact_logs', 'contact_logs table exists');
select ok(
  (select c.relrowsecurity
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'contact_logs'),
  'contact_logs has RLS enabled'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.staff_assign_enquiry(text,uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot execute assignment RPC directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_outbox_events(text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot claim outbox work'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'staff-one@example.test', now(), now()),
  ('61000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'staff-two@example.test', now(), now()),
  ('61000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'senior@example.test', now(), now());

insert into public.firms (id, name, slug, controller_name, privacy_policy_url)
values (
  '62000000-0000-0000-0000-000000000001',
  'Staff Action Test Firm',
  'staff-action-test-firm',
  'Staff Action Test Firm',
  'https://staff-actions.example.test/privacy'
);

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at
) values (
  '63000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  1,
  '5.2',
  'v5.2',
  'staff-actions-v1',
  'https://staff-actions.example.test/privacy',
  true,
  now()
);

insert into public.published_forms (
  id, firm_id, configuration_id, published_form_id, status
) values (
  '64000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000001',
  'staff_actions_form_abcdefghijk',
  'active'
);

insert into public.staff_memberships (id, firm_id, auth_user_id, role, status)
values
  ('65000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'staff', 'active'),
  ('65000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'staff', 'active'),
  ('65000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000003', 'senior', 'active');

select * from public.persist_intake_submission_v52(
  'staff_actions_form_abcdefghijk',
  '{"full_name":"Staff Action Prospect","email":"actions@example.test","phone":"+442079460803","preferred_contact_method":"Email","category":"Making a new application","location_status":"Inside the UK","urgency_flags":["none"],"past_date_confirmations":{},"existing_representative":"No","privacy_notice_version":"staff-actions-v1","privacy_notice_url":"https://staff-actions.example.test/privacy","privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"}'::jsonb,
  repeat('3', 64),
  '{"effective_decision_received":false,"effective_detained":false,"effective_removal_date":false,"detention_category_unresolved":false,"location_uncertain":false}'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

select set_config(
  'test.staff_action_reference',
  (select public_reference from public.enquiries where firm_id = '62000000-0000-0000-0000-000000000001'),
  true
);

set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select is(auth.uid(), null::uuid, 'service-role staff RPC path has no user JWT identity');
select lives_ok(
  format(
    'select public.staff_assign_enquiry(%L, %L::uuid, true)',
    current_setting('test.staff_action_reference'),
    '61000000-0000-0000-0000-000000000001'
  ),
  'staff assignment succeeds through explicit verified actor identity'
);
reset role;

select is(
  (select assigned_staff_membership_id from public.enquiries where public_reference = current_setting('test.staff_action_reference')),
  '65000000-0000-0000-0000-000000000001'::uuid,
  'assign-to-self stores the actor membership id'
);
select is(
  (select count(*)::integer from public.audit_events where event_type = 'STAFF_ASSIGNMENT_CHANGED'),
  1,
  'assignment creates an audit event'
);

set local role service_role;
select lives_ok(
  format(
    'select public.staff_change_enquiry_status(%L, %L::public.enquiry_status, %L::uuid)',
    current_setting('test.staff_action_reference'),
    'CONTACTED',
    '61000000-0000-0000-0000-000000000001'
  ),
  'status change succeeds through service-role broker'
);
reset role;
select is(
  (select status::text from public.enquiries where public_reference = current_setting('test.staff_action_reference')),
  'CONTACTED',
  'status mutation persists the requested status'
);
select is(
  (select count(*)::integer from public.audit_events where event_type = 'ENQUIRY_STATUS_CHANGED'),
  1,
  'status change creates an audit event'
);

set local role service_role;
select lives_ok(
  format(
    'select public.staff_log_contact(%L, %L::uuid, %L, %L, %L, %L, now())',
    current_setting('test.staff_action_reference'),
    '61000000-0000-0000-0000-000000000001',
    'PHONE',
    'OUTBOUND',
    'Voicemail left',
    'Factual test note'
  ),
  'contact logging succeeds through service-role broker'
);
reset role;
select is(
  (select count(*)::integer from public.contact_logs),
  1,
  'contact log row is persisted'
);
select is(
  (select count(*)::integer from public.audit_events where event_type = 'CONTACT_LOGGED'),
  1,
  'contact log creates an audit event'
);

set local role service_role;
select throws_ok(
  format(
    'select public.staff_assign_enquiry(%L, %L::uuid, true)',
    current_setting('test.staff_action_reference'),
    '61000000-0000-0000-0000-000000000002'
  ),
  'P0001',
  'Only senior staff may take over another staff assignment',
  'ordinary staff cannot take over another staff assignment'
);
select lives_ok(
  format(
    'select public.staff_assign_enquiry(%L, %L::uuid, true)',
    current_setting('test.staff_action_reference'),
    '61000000-0000-0000-0000-000000000003'
  ),
  'senior staff may take over an existing assignment'
);
reset role;
select is(
  (select assigned_staff_membership_id from public.enquiries where public_reference = current_setting('test.staff_action_reference')),
  '65000000-0000-0000-0000-000000000003'::uuid,
  'senior takeover updates assignment to senior membership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.contact_logs),
  1,
  'AAL2 staff can read same-firm contact history'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-0000-0000-000000000001","aal":"aal1","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.contact_logs),
  0,
  'AAL1 staff cannot read contact history'
);
reset role;

set local role service_role;
select is(
  (select count(*)::integer from public.claim_outbox_events('worker-a', 1, 120)),
  1,
  'worker atomically claims one due outbox event'
);
reset role;
select is(
  (select count(*)::integer from public.outbox_events where delivery_status = 'PROCESSING' and lease_owner = 'worker-a'),
  1,
  'claimed outbox row records its lease owner'
);
select set_config(
  'test.claimed_event_id',
  (select event_id::text from public.outbox_events where lease_owner = 'worker-a'),
  true
);

set local role service_role;
select throws_ok(
  format(
    'select public.complete_outbox_event(%L::uuid, %L)',
    current_setting('test.claimed_event_id'),
    'wrong-worker'
  ),
  'P0001',
  'Outbox claim not found',
  'wrong worker cannot complete another worker lease'
);
select lives_ok(
  format(
    'select public.complete_outbox_event(%L::uuid, %L)',
    current_setting('test.claimed_event_id'),
    'worker-a'
  ),
  'lease owner can complete its claimed event'
);
reset role;
select ok(
  exists (
    select 1 from public.outbox_events
    where event_id = current_setting('test.claimed_event_id')::uuid
      and delivery_status = 'DELIVERED'
      and lease_owner is null
      and lease_expires_at is null
  ),
  'completed event clears lease metadata and becomes delivered'
);

set local role service_role;
select is(
  (select count(*)::integer from public.claim_outbox_events('worker-b', 1, 120)),
  1,
  'worker can claim the remaining due event'
);
reset role;
select set_config(
  'test.failed_event_id',
  (select event_id::text from public.outbox_events where lease_owner = 'worker-b'),
  true
);
set local role service_role;
select lives_ok(
  format(
    'select public.fail_outbox_event(%L::uuid, %L, 8)',
    current_setting('test.failed_event_id'),
    'worker-b'
  ),
  'worker can fail its claimed event for retry'
);
reset role;
select ok(
  exists (
    select 1 from public.outbox_events
    where event_id = current_setting('test.failed_event_id')::uuid
      and delivery_status = 'FAILED'
      and next_attempt_at is not null
      and lease_owner is null
      and lease_expires_at is null
  ),
  'failed delivery schedules retry and clears lease metadata'
);
select ok(
  not exists (
    select 1 from public.outbox_events where payload ? '_worker_claim'
  ),
  'worker bookkeeping never mutates the business delivery payload'
);

select * from finish();
rollback;

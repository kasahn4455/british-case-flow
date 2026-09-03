create extension if not exists pgtap with schema extensions;

begin;
select plan(10);

select ok(
  to_regprocedure('public.get_firm_settings_overview(uuid)') is not null,
  'firm settings overview function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_firm_settings_overview(uuid)',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot execute operational overview directly'
);

insert into public.firms (id, name, slug, controller_name, privacy_policy_url)
values (
  '75000000-0000-0000-0000-000000000001',
  'Settings Overview Firm',
  'settings-overview-firm',
  'Settings Overview Firm',
  'https://settings-overview.example.test/privacy'
);

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at
)
values (
  '76000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  1, '5.2', 'v5.2', 'settings-v1',
  'https://settings-overview.example.test/privacy', true, now()
);

insert into public.published_forms (id, firm_id, configuration_id, published_form_id, status)
values (
  '77000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  '76000000-0000-0000-0000-000000000001',
  'settings_overview_form_abcdefgh',
  'active'
);

select is(
  (
    select published_form_id
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  'settings_overview_form_abcdefgh',
  'overview returns the firm published form from the database'
);

select is(
  (
    select pending_count
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  0::bigint,
  'new firm starts with no pending outbox events'
);

select * from public.persist_intake_submission_v52(
  'settings_overview_form_abcdefgh',
  '{"full_name":"Settings Test Prospect","email":"settings@example.test","phone":"+442079460803","preferred_contact_method":"Email","category":"Making a new application","location_status":"Inside the UK","urgency_flags":["none"],"past_date_confirmations":{},"existing_representative":"No","privacy_notice_version":"settings-v1","privacy_notice_url":"https://settings-overview.example.test/privacy","privacy_notice_displayed_at":"2026-09-03T05:00:00+01:00"}'::jsonb,
  repeat('c', 64),
  '{"effective_decision_received":false,"effective_detained":false,"effective_removal_date":false,"detention_category_unresolved":false,"location_uncertain":false}'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

select is(
  (
    select pending_count
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  2::bigint,
  'overview counts both queued notification events'
);

update public.outbox_events
set delivery_status = 'DELIVERED'::public.outbox_delivery_status,
    retry_count = 1,
    last_attempt_at = now(),
    delivered_at = now()
where firm_id = '75000000-0000-0000-0000-000000000001'
  and event_type = 'ENQUIRY_INTERNAL_ALERT'::public.outbox_event_type;

update public.outbox_events
set delivery_status = 'FAILED'::public.outbox_delivery_status,
    retry_count = 8,
    last_attempt_at = now(),
    dead_letter_status = true
where firm_id = '75000000-0000-0000-0000-000000000001'
  and event_type = 'PROSPECT_ACKNOWLEDGEMENT'::public.outbox_event_type;

select is(
  (
    select delivered_count
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  1::bigint,
  'overview counts delivered notifications'
);
select is(
  (
    select dead_letter_count
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  1::bigint,
  'overview counts dead-lettered notifications separately'
);
select is(
  (
    select failed_count
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  0::bigint,
  'dead letters are not reported as retryable failures'
);
select ok(
  (
    select last_delivered_at is not null
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  'overview reports the latest successful delivery time'
);
select ok(
  (
    select scheduler_active
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  'automatic outbox retry scheduler is active'
);
select is(
  (
    select scheduler_schedule
    from public.get_firm_settings_overview('75000000-0000-0000-0000-000000000001')
  ),
  '*/2 * * * *',
  'overview reports the configured two-minute retry schedule'
);

select * from finish();
rollback;

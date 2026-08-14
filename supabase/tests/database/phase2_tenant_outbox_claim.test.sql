create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

select ok(
  to_regprocedure('public.claim_outbox_events_for_firm(text,uuid,integer,integer)') is not null,
  'tenant-scoped outbox claim function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_outbox_events_for_firm(text,uuid,integer,integer)',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot execute tenant outbox claims directly'
);

insert into public.firms (id, name, slug, controller_name, privacy_policy_url)
values
  (
    '72000000-0000-0000-0000-000000000001',
    'Outbox Firm A',
    'outbox-firm-a',
    'Outbox Firm A',
    'https://firm-a.example.test/privacy'
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    'Outbox Firm B',
    'outbox-firm-b',
    'Outbox Firm B',
    'https://firm-b.example.test/privacy'
  );

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at
)
values
  (
    '73000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    1, '5.2', 'v5.2', 'outbox-a-v1', 'https://firm-a.example.test/privacy', true, now()
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000002',
    1, '5.2', 'v5.2', 'outbox-b-v1', 'https://firm-b.example.test/privacy', true, now()
  );

insert into public.published_forms (id, firm_id, configuration_id, published_form_id, status)
values
  (
    '74000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    'tenant_outbox_form_a_abcdefgh',
    'active'
  ),
  (
    '74000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000002',
    'tenant_outbox_form_b_abcdefgh',
    'active'
  );

select * from public.persist_intake_submission_v52(
  'tenant_outbox_form_a_abcdefgh',
  '{"full_name":"Firm A Prospect","email":"firm-a@example.test","phone":"+442079460801","preferred_contact_method":"Email","category":"Making a new application","location_status":"Inside the UK","urgency_flags":["none"],"past_date_confirmations":{},"existing_representative":"No","privacy_notice_version":"outbox-a-v1","privacy_notice_url":"https://firm-a.example.test/privacy","privacy_notice_displayed_at":"2026-08-14T12:00:00+01:00"}'::jsonb,
  repeat('a', 64),
  '{"effective_decision_received":false,"effective_detained":false,"effective_removal_date":false,"detention_category_unresolved":false,"location_uncertain":false}'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

select * from public.persist_intake_submission_v52(
  'tenant_outbox_form_b_abcdefgh',
  '{"full_name":"Firm B Prospect","email":"firm-b@example.test","phone":"+442079460802","preferred_contact_method":"Email","category":"Making a new application","location_status":"Inside the UK","urgency_flags":["none"],"past_date_confirmations":{},"existing_representative":"No","privacy_notice_version":"outbox-b-v1","privacy_notice_url":"https://firm-b.example.test/privacy","privacy_notice_displayed_at":"2026-08-14T12:00:00+01:00"}'::jsonb,
  repeat('b', 64),
  '{"effective_decision_received":false,"effective_detained":false,"effective_removal_date":false,"detention_category_unresolved":false,"location_uncertain":false}'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_outbox_events_for_firm(
      'firm-a-worker',
      '72000000-0000-0000-0000-000000000001'::uuid,
      10,
      120
    )
  ),
  2,
  'firm-scoped worker claims both due events for the requested firm'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.outbox_events
    where firm_id = '72000000-0000-0000-0000-000000000001'
      and delivery_status = 'PROCESSING'
      and lease_owner = 'firm-a-worker'
  ),
  2,
  'requested firm rows receive the worker lease'
);

select is(
  (
    select count(*)::integer
    from public.outbox_events
    where firm_id = '72000000-0000-0000-0000-000000000002'
      and delivery_status = 'PENDING'
      and lease_owner is null
  ),
  2,
  'other firm rows remain untouched and pending'
);

select * from finish();
rollback;

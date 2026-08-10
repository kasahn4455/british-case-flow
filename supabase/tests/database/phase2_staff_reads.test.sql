create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '51000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'staff-a@example.test',
  now(),
  now()
);

insert into public.firms (id, name, slug, controller_name, privacy_policy_url)
values
  ('52000000-0000-0000-0000-000000000001', 'Firm A', 'staff-read-firm-a', 'Firm A', 'https://a.example.test/privacy'),
  ('52000000-0000-0000-0000-000000000002', 'Firm B', 'staff-read-firm-b', 'Firm B', 'https://b.example.test/privacy');

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at
) values
  ('53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 1, '5.2', 'v5.2', 'a-v1', 'https://a.example.test/privacy', true, now()),
  ('53000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002', 1, '5.2', 'v5.2', 'b-v1', 'https://b.example.test/privacy', true, now());

insert into public.published_forms (id, firm_id, configuration_id, published_form_id, status)
values
  ('54000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'staff_read_form_a_abcdefghijk', 'active'),
  ('54000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000002', 'staff_read_form_b_abcdefghijk', 'active');

insert into public.staff_memberships (id, firm_id, auth_user_id, role, status)
values (
  '55000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'staff',
  'active'
);

select * from public.persist_intake_submission_v52(
  'staff_read_form_a_abcdefghijk',
  '{"full_name":"Firm A Prospect","email":"a@example.test","phone":"+442079460801","preferred_contact_method":"Email","category":"Making a new application","location_status":"Inside the UK","urgency_flags":["none"],"past_date_confirmations":{},"existing_representative":"No","privacy_notice_version":"a-v1","privacy_notice_url":"https://a.example.test/privacy","privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"}'::jsonb,
  repeat('1', 64),
  '{"effective_decision_received":false,"effective_detained":false,"effective_removal_date":false,"detention_category_unresolved":false,"location_uncertain":false}'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

select * from public.persist_intake_submission_v52(
  'staff_read_form_b_abcdefghijk',
  '{"full_name":"Firm B Prospect","email":"b@example.test","phone":"+442079460802","preferred_contact_method":"Email","category":"Making a new application","location_status":"Inside the UK","urgency_flags":["none"],"past_date_confirmations":{},"existing_representative":"No","privacy_notice_version":"b-v1","privacy_notice_url":"https://b.example.test/privacy","privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"}'::jsonb,
  repeat('2', 64),
  '{"effective_decision_received":false,"effective_detained":false,"effective_removal_date":false,"detention_category_unresolved":false,"location_uncertain":false}'::jsonb,
  'ROUTINE'::public.enquiry_priority,
  array['ROUTINE_FALLBACK']::text[],
  'Matched ROUTINE_FALLBACK',
  '5.2',
  'v5.2'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.enquiries),
  1,
  'AAL2 staff sees only enquiries belonging to their active firm membership'
);

select is(
  (select count(*)::integer from public.enquiries where firm_id = '52000000-0000-0000-0000-000000000002'),
  0,
  'AAL2 staff cannot enumerate another firm enquiries even with an explicit foreign firm filter'
);

select is(
  (select count(*)::integer from public.routing_results),
  1,
  'routing results are tenant-isolated by the same AAL2 firm boundary'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000001","aal":"aal1","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.enquiries),
  0,
  'AAL1 staff cannot read enquiries'
);

reset role;
select * from finish();
rollback;

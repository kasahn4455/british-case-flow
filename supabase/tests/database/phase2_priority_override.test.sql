create extension if not exists pgtap with schema extensions;

begin;

select plan(12);

select ok(
  to_regprocedure('public.override_enquiry_priority(uuid,public.enquiry_priority,text)') is null,
  'obsolete user-JWT-dependent 3-argument override RPC is removed'
);

select ok(
  to_regprocedure('public.override_enquiry_priority(uuid,public.enquiry_priority,text,uuid)') is not null,
  'server-brokered 4-argument override RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.override_enquiry_priority(uuid,public.enquiry_priority,text,uuid)',
    'EXECUTE'
  ),
  'service_role can execute the brokered override RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.override_enquiry_priority(uuid,public.enquiry_priority,text,uuid)',
    'EXECUTE'
  ),
  'authenticated browser role cannot execute the brokered override RPC directly'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
) values (
  '40000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'override-staff@example.test',
  now(),
  now()
);

insert into public.firms (
  id, name, slug, controller_name, privacy_policy_url
) values (
  '41000000-0000-0000-0000-000000000001',
  'Override Test Solicitors',
  'override-test-solicitors',
  'Override Test Solicitors',
  'https://example.test/privacy'
);

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at
) values (
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  1,
  '5.2',
  'v5.2',
  'override-v1',
  'https://example.test/privacy',
  true,
  now()
);

insert into public.published_forms (
  id, firm_id, configuration_id, published_form_id, status
) values (
  '43000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'form_override_test_abcdefghijkl',
  'active'
);

insert into public.staff_memberships (
  id, firm_id, auth_user_id, role, status
) values (
  '44000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'staff',
  'active'
);

select * from public.persist_intake_submission_v52(
  'form_override_test_abcdefghijkl',
  '{
    "full_name":"Override Demo",
    "email":"override@example.test",
    "phone":"+442079460812",
    "preferred_contact_method":"Email",
    "category":"Making a new application",
    "location_status":"Inside the UK",
    "urgency_flags":["none"],
    "past_date_confirmations":{},
    "existing_representative":"No",
    "privacy_notice_version":"override-v1",
    "privacy_notice_url":"https://example.test/privacy",
    "privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"
  }'::jsonb,
  repeat('f', 64),
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

set local role service_role;

select lives_ok(
  $$
    select public.override_enquiry_priority(
      (select id from public.enquiries where firm_id = '41000000-0000-0000-0000-000000000001'),
      'URGENT'::public.enquiry_priority,
      'Staff escalation after human review',
      '40000000-0000-0000-0000-000000000001'
    )
  $$,
  'service-role RPC succeeds without auth.uid()/user JWT context when actor is explicitly brokered'
);

reset role;

select is(
  (select priority::text from public.enquiries where firm_id = '41000000-0000-0000-0000-000000000001'),
  'URGENT',
  'authorised staff may increase priority'
);

select is(
  (
    select overridden_by::text
    from public.priority_overrides
    where firm_id = '41000000-0000-0000-0000-000000000001'
    order by created_at desc
    limit 1
  ),
  '40000000-0000-0000-0000-000000000001',
  'override row records the brokered staff actor'
);

select is(
  (
    select actor_auth_user_id::text
    from public.audit_events
    where firm_id = '41000000-0000-0000-0000-000000000001'
      and event_type = 'PRIORITY_OVERRIDE'
    order by created_at desc
    limit 1
  ),
  '40000000-0000-0000-0000-000000000001',
  'audit event records the brokered staff actor'
);

set local role service_role;

select throws_ok(
  $$
    select public.override_enquiry_priority(
      (select id from public.enquiries where firm_id = '41000000-0000-0000-0000-000000000001'),
      'ROUTINE'::public.enquiry_priority,
      'Attempted staff de-escalation after review',
      '40000000-0000-0000-0000-000000000001'
    )
  $$,
  'Only senior, manager or admin roles may decrease priority',
  'ordinary staff cannot decrease priority'
);

reset role;

update public.staff_memberships
set role = 'senior'::public.staff_role
where id = '44000000-0000-0000-0000-000000000001';

set local role service_role;

select lives_ok(
  $$
    select public.override_enquiry_priority(
      (select id from public.enquiries where firm_id = '41000000-0000-0000-0000-000000000001'),
      'ROUTINE'::public.enquiry_priority,
      'Senior de-escalation after documented review',
      '40000000-0000-0000-0000-000000000001'
    )
  $$,
  'senior staff can decrease priority after documented review'
);

reset role;

select is(
  (select priority::text from public.enquiries where firm_id = '41000000-0000-0000-0000-000000000001'),
  'ROUTINE',
  'senior decrease is persisted'
);

set local role service_role;

select throws_ok(
  $$
    select public.override_enquiry_priority(
      (select id from public.enquiries where firm_id = '41000000-0000-0000-0000-000000000001'),
      'URGENT'::public.enquiry_priority,
      'Unknown actor attempt after human review',
      '40000000-0000-0000-0000-000000000099'
    )
  $$,
  'Firm access denied',
  'brokered actor must still have active same-firm membership'
);

reset role;

select * from finish();
rollback;

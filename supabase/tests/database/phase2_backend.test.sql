create extension if not exists pgtap with schema extensions;

begin;

select plan(24);

select has_table('public', 'firms', 'firms table exists');
select has_table('public', 'firm_configurations', 'firm_configurations table exists');
select has_table('public', 'published_forms', 'published_forms table exists');
select has_table('public', 'staff_memberships', 'staff_memberships table exists');
select has_table('public', 'submission_snapshots', 'submission_snapshots table exists');
select has_table('public', 'enquiries', 'enquiries table exists');
select has_table('public', 'routing_results', 'routing_results table exists');
select has_table('public', 'outbox_events', 'outbox_events table exists');
select has_table('public', 'audit_events', 'audit_events table exists');
select has_table('public', 'priority_overrides', 'priority_overrides table exists');
select has_table('public', 'access_logs', 'access_logs table exists');

select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'firms','firm_configurations','published_forms','staff_memberships','submission_snapshots',
       'enquiries','routing_results','outbox_events','audit_events','priority_overrides','access_logs'
     ])),
  'RLS is enabled on every Phase 2 public table'
);

select ok(
  not has_table_privilege('anon', 'public.enquiries', 'INSERT'),
  'anon cannot insert directly into enquiries'
);

select ok(
  not has_table_privilege('authenticated', 'public.enquiries', 'INSERT'),
  'authenticated staff cannot bypass the authoritative submission path with direct enquiry inserts'
);

select ok(
  not has_table_privilege('authenticated', 'public.outbox_events', 'SELECT'),
  'authenticated staff cannot directly read delivery outbox rows'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'persist_intake_submission_v52'
      and p.prosecdef
  ),
  'atomic persistence function is SECURITY DEFINER'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.persist_intake_submission_v52(text,jsonb,text,jsonb,public.enquiry_priority,text[],text,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute atomic persistence RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.persist_intake_submission_v52(text,jsonb,text,jsonb,public.enquiry_priority,text[],text,text,text)',
    'EXECUTE'
  ),
  'service_role can execute atomic persistence RPC'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    where c.contype = 'f'
      and child.relname = 'enquiries'
      and parent.relname = 'staff_memberships'
      and array_length(c.conkey, 1) = 2
  ),
  'enquiry assignment uses a composite same-firm foreign key'
);

insert into public.firms (
  id, name, slug, controller_name, privacy_policy_url
) values (
  '10000000-0000-0000-0000-000000000001',
  'Test Immigration Solicitors',
  'test-immigration-solicitors',
  'Test Immigration Solicitors',
  'https://example.test/privacy'
);

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  1,
  '5.2',
  'v5.2',
  'test-v1',
  'https://example.test/privacy',
  true,
  now()
);

insert into public.published_forms (
  id, firm_id, configuration_id, published_form_id, status
) values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'form_abcdefghijklmnopqrstuvwxyz',
  'active'
);

select lives_ok(
  $$
    select * from public.persist_intake_submission_v52(
      'form_abcdefghijklmnopqrstuvwxyz',
      '{
        "full_name":"Demo Person",
        "email":"demo@example.test",
        "phone":"+442079460812",
        "preferred_contact_method":"Email",
        "category":"Making a new application",
        "location_status":"Inside the UK",
        "urgency_flags":["none"],
        "past_date_confirmations":{},
        "existing_representative":"No",
        "privacy_notice_version":"test-v1",
        "privacy_notice_url":"https://example.test/privacy",
        "privacy_notice_displayed_at":"2026-08-10T12:00:00+01:00"
      }'::jsonb,
      repeat('a', 64),
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
    )
  $$,
  'atomic v5.2 persistence RPC accepts a valid server-routed submission'
);

select is(
  (select count(*)::integer from public.enquiries),
  1,
  'atomic RPC creates exactly one enquiry'
);

select is(
  (select count(*)::integer from public.routing_results),
  1,
  'atomic RPC creates exactly one routing result'
);

select is(
  (select count(*)::integer from public.outbox_events),
  2,
  'atomic RPC creates both required outbox events'
);

select is(
  (select count(*)::integer from public.audit_events where event_type = 'SUBMISSION_ROUTED'),
  1,
  'atomic RPC creates the submission audit event'
);

select ok(
  exists (
    select 1
    from public.outbox_events
    where event_type = 'PROSPECT_ACKNOWLEDGEMENT'
      and payload->'message_paragraphs'->>1 like '%does not mean that Test Immigration Solicitors has agreed to act for you%'
      and payload->'message_paragraphs'->>1 like '%deadline has been protected%'
  ),
  'prospect acknowledgement contains the approved non-retainer and deadline wording'
);

select ok(
  exists (
    select 1
    from public.outbox_events
    where event_type = 'ENQUIRY_INTERNAL_ALERT'
      and not (payload ? 'recipient_email')
      and not (payload ? 'recipient_phone')
  ),
  'internal alert outbox payload remains minimal and excludes contact details'
);

select * from finish();
rollback;

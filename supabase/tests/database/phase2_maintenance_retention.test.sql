create extension if not exists pgtap with schema extensions;

begin;
select plan(3);

insert into public.firms (id, name, slug, controller_name, privacy_policy_url)
values (
  '72000000-0000-0000-0000-000000000001',
  'Maintenance Test Firm',
  'maintenance-test-firm',
  'Maintenance Test Firm',
  'https://maintenance.example.test/privacy'
);

insert into public.firm_configurations (
  id, firm_id, version, schema_version, routing_rule_version,
  privacy_notice_version, privacy_notice_url, is_active, approved_at
) values (
  '73000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  1,
  '5.2',
  'v5.2',
  'maintenance-v1',
  'https://maintenance.example.test/privacy',
  true,
  now()
);

insert into public.published_forms (
  id, firm_id, configuration_id, published_form_id, status
) values (
  '74000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'maintenance_form_abcdefghijk',
  'active'
);

insert into public.intake_rate_limit_windows (
  firm_id, published_form_id, key_kind, key_hash,
  window_started_at, request_count, last_seen_at
) values (
  '72000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  'ip',
  repeat('a', 64),
  now() - interval '72 hours',
  1,
  now() - interval '72 hours'
);

insert into public.security_events (
  firm_id, event_type, severity, scope_hash,
  window_started_at, observed_count, metadata, created_at, updated_at
) values (
  '72000000-0000-0000-0000-000000000001',
  'RATE_LIMIT_TRIGGERED',
  'warning',
  repeat('b', 64),
  now() - interval '120 days',
  1,
  '{}'::jsonb,
  now() - interval '120 days',
  now() - interval '120 days'
);

set local role service_role;
select is(
  (public.cleanup_intake_operational_data()->>'security_event_retention_deferred')::boolean,
  true,
  'maintenance explicitly reports that security-event retention is deferred'
);
reset role;

select is(
  (select count(*)::integer from public.intake_rate_limit_windows where firm_id = '72000000-0000-0000-0000-000000000001'),
  0,
  'maintenance deletes expired ephemeral rate-limit state'
);

select is(
  (select count(*)::integer from public.security_events where firm_id = '72000000-0000-0000-0000-000000000001'),
  1,
  'maintenance preserves old security events until an approved retention policy exists'
);

select * from finish();
rollback;

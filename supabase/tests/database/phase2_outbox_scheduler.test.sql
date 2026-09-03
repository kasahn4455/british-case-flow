create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

select ok(
  exists (select 1 from pg_extension where extname = 'pg_net'),
  'pg_net is enabled for asynchronous worker wakes'
);
select ok(
  exists (select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron is enabled for retry wakes'
);
select ok(
  to_regprocedure('public.get_outbox_scheduler_token()') is not null,
  'service-only scheduler token function exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_outbox_scheduler_token()',
    'EXECUTE'
  ),
  'service role can read the scheduler token for server-side verification'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_outbox_scheduler_token()',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot read the scheduler token'
);
select ok(
  length(public.get_outbox_scheduler_token()) >= 64,
  'scheduler token is high entropy and generated inside the database'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'outbox_events_wake_worker'
      and tgrelid = 'public.outbox_events'::regclass
      and not tgisinternal
  ),
  'outbox inserts wake the worker asynchronously'
);
select ok(
  exists (
    select 1
    from cron.job
    where jobname = 'outbox-worker-retry'
      and schedule = '*/2 * * * *'
  ),
  'retry wake is scheduled every two minutes'
);

select * from finish();
rollback;

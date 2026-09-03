create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Keep scheduler authentication separate from application environment variables.
-- The token is generated inside Postgres and stored encrypted in Supabase Vault.
do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'outbox_scheduler_token'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'outbox_scheduler_token',
      'Authenticates database-triggered British Case Flow outbox worker wake requests'
    );
  end if;
end;
$$;

create or replace function public.get_outbox_scheduler_token()
returns text
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select decrypted_secret::text
  from vault.decrypted_secrets
  where name = 'outbox_scheduler_token'
  order by updated_at desc
  limit 1;
$$;

revoke all on function public.get_outbox_scheduler_token() from public;
revoke all on function public.get_outbox_scheduler_token() from anon;
revoke all on function public.get_outbox_scheduler_token() from authenticated;
grant execute on function public.get_outbox_scheduler_token() to service_role;

-- Environment-specific worker URLs live in Vault under outbox_worker_url. The
-- migration intentionally does not create that value so disposable/local DBs
-- never call a production deployment. Production config can add it after deploy.
create or replace function public.wake_outbox_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret::text
  into v_url
  from vault.decrypted_secrets
  where name = 'outbox_worker_url'
  order by updated_at desc
  limit 1;

  select decrypted_secret::text
  into v_token
  from vault.decrypted_secrets
  where name = 'outbox_scheduler_token'
  order by updated_at desc
  limit 1;

  if v_url is null or v_token is null then
    return null;
  end if;

  if left(v_url, 8) <> 'https://' then
    raise warning 'Outbox worker URL must use HTTPS';
    return null;
  end if;

  select net.http_post(
    url := v_url,
    body := jsonb_build_object('source', 'database'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-outbox-scheduler-token', v_token
    ),
    timeout_milliseconds := 5000
  )
  into v_request_id;

  return v_request_id;
exception
  when others then
    raise warning 'Outbox worker wake request could not be queued';
    return null;
end;
$$;

revoke all on function public.wake_outbox_worker() from public;
revoke all on function public.wake_outbox_worker() from anon;
revoke all on function public.wake_outbox_worker() from authenticated;

create or replace function public.wake_outbox_worker_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.wake_outbox_worker();
  return null;
end;
$$;

revoke all on function public.wake_outbox_worker_after_insert() from public;
revoke all on function public.wake_outbox_worker_after_insert() from anon;
revoke all on function public.wake_outbox_worker_after_insert() from authenticated;

drop trigger if exists outbox_events_wake_worker on public.outbox_events;
create trigger outbox_events_wake_worker
after insert on public.outbox_events
for each statement
execute function public.wake_outbox_worker_after_insert();

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'outbox-worker-retry'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'outbox-worker-retry',
    '*/2 * * * *',
    'select public.wake_outbox_worker();'
  );
end;
$$;

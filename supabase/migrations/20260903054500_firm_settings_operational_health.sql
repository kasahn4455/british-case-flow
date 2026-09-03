create or replace function public.get_firm_settings_overview(p_firm_id uuid)
returns table (
  published_form_id text,
  published_form_status text,
  pending_count bigint,
  processing_count bigint,
  failed_count bigint,
  delivered_count bigint,
  dead_letter_count bigint,
  last_delivered_at timestamptz,
  scheduler_active boolean,
  scheduler_schedule text,
  scheduler_last_status text,
  scheduler_last_run_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, cron
as $$
  with latest_form as (
    select pf.published_form_id, pf.status
    from public.published_forms pf
    where pf.firm_id = p_firm_id
    order by
      case when pf.status = 'active' then 0 else 1 end,
      pf.created_at desc
    limit 1
  ),
  outbox_health as (
    select
      count(*) filter (
        where oe.delivery_status = 'PENDING'::public.outbox_delivery_status
          and oe.dead_letter_status = false
      ) as pending_count,
      count(*) filter (
        where oe.delivery_status = 'PROCESSING'::public.outbox_delivery_status
          and oe.dead_letter_status = false
      ) as processing_count,
      count(*) filter (
        where oe.delivery_status = 'FAILED'::public.outbox_delivery_status
          and oe.dead_letter_status = false
      ) as failed_count,
      count(*) filter (
        where oe.delivery_status = 'DELIVERED'::public.outbox_delivery_status
      ) as delivered_count,
      count(*) filter (where oe.dead_letter_status = true) as dead_letter_count,
      max(oe.delivered_at) filter (
        where oe.delivery_status = 'DELIVERED'::public.outbox_delivery_status
      ) as last_delivered_at
    from public.outbox_events oe
    where oe.firm_id = p_firm_id
  ),
  scheduler as (
    select
      j.jobid,
      j.active,
      j.schedule,
      (
        select d.status::text
        from cron.job_run_details d
        where d.jobid = j.jobid
        order by d.start_time desc
        limit 1
      ) as last_status,
      (
        select d.start_time
        from cron.job_run_details d
        where d.jobid = j.jobid
        order by d.start_time desc
        limit 1
      ) as last_run_at
    from cron.job j
    where j.jobname = 'outbox-worker-retry'
    order by j.jobid desc
    limit 1
  )
  select
    lf.published_form_id,
    lf.status,
    oh.pending_count,
    oh.processing_count,
    oh.failed_count,
    oh.delivered_count,
    oh.dead_letter_count,
    oh.last_delivered_at,
    coalesce(s.active, false),
    s.schedule,
    s.last_status,
    s.last_run_at
  from outbox_health oh
  left join latest_form lf on true
  left join scheduler s on true;
$$;

revoke all on function public.get_firm_settings_overview(uuid) from public;
revoke all on function public.get_firm_settings_overview(uuid) from anon;
revoke all on function public.get_firm_settings_overview(uuid) from authenticated;
grant execute on function public.get_firm_settings_overview(uuid) to service_role;

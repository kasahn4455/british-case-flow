create or replace function public.claim_outbox_events_for_firm(
  p_worker_id text,
  p_firm_id uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 120 then
    raise exception 'Worker id is required';
  end if;
  if p_firm_id is null then
    raise exception 'Firm id is required';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'Invalid claim limit';
  end if;
  if p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid lease duration';
  end if;

  return query
  with candidates as (
    select oe.event_id
    from public.outbox_events oe
    where oe.firm_id = p_firm_id
      and oe.dead_letter_status = false
      and (
        (
          oe.delivery_status in (
            'PENDING'::public.outbox_delivery_status,
            'FAILED'::public.outbox_delivery_status
          )
          and (oe.next_attempt_at is null or oe.next_attempt_at <= now())
        )
        or
        (
          oe.delivery_status = 'PROCESSING'::public.outbox_delivery_status
          and oe.lease_expires_at is not null
          and oe.lease_expires_at <= now()
        )
      )
    order by oe.created_at
    for update skip locked
    limit p_limit
  )
  update public.outbox_events oe
  set delivery_status = 'PROCESSING'::public.outbox_delivery_status,
      retry_count = oe.retry_count + 1,
      last_attempt_at = now(),
      next_attempt_at = null,
      lease_owner = trim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  from candidates c
  where oe.event_id = c.event_id
  returning oe.*;
end;
$$;

revoke all on function public.claim_outbox_events_for_firm(text, uuid, integer, integer)
from public, anon, authenticated;

grant execute on function public.claim_outbox_events_for_firm(text, uuid, integer, integer)
to service_role;

-- Security-event retention is a policy decision and must not be invented by code.
-- Automatic maintenance is limited to ephemeral abuse-rate-limit state.
create or replace function public.cleanup_intake_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rate_limits integer;
begin
  delete from public.intake_rate_limit_windows
  where window_started_at < now() - interval '48 hours';
  get diagnostics v_rate_limits = row_count;

  return jsonb_build_object(
    'rate_limit_windows_deleted', v_rate_limits,
    'security_event_retention_deferred', true
  );
end;
$$;

revoke all on function public.cleanup_intake_operational_data() from public, anon, authenticated;
grant execute on function public.cleanup_intake_operational_data() to service_role;

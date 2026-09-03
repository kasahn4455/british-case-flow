create extension if not exists pgtap with schema extensions;

begin;
select plan(16);

select ok(
  to_regprocedure('public.list_firm_staff_for_admin()') is not null,
  'public staff-list RPC remains available'
);
select ok(
  to_regprocedure('public.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)') is not null,
  'public staff-update RPC remains available'
);
select ok(
  to_regprocedure('private.list_firm_staff_for_admin()') is not null,
  'privileged staff-list implementation lives in private schema'
);
select ok(
  to_regprocedure('private.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)') is not null,
  'privileged staff-update implementation lives in private schema'
);

select ok(
  not (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.oid = 'public.list_firm_staff_for_admin()'::regprocedure
  ),
  'public staff-list RPC is SECURITY INVOKER'
);
select ok(
  not (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.oid = 'public.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)'::regprocedure
  ),
  'public staff-update RPC is SECURITY INVOKER'
);
select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.oid = 'private.list_firm_staff_for_admin()'::regprocedure
  ),
  'private staff-list helper retains SECURITY DEFINER for auth schema access'
);
select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.oid = 'private.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)'::regprocedure
  ),
  'private staff-update helper retains SECURITY DEFINER for controlled mutation'
);
select ok(
  has_function_privilege('authenticated', 'public.list_firm_staff_for_admin()', 'EXECUTE'),
  'authenticated role can call the checked public staff-list RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)',
    'EXECUTE'
  ),
  'authenticated role can call the checked public staff-update RPC'
);

select ok(
  not has_function_privilege('anon', 'public.list_firm_staff_for_admin()', 'EXECUTE'),
  'anonymous role cannot call the public staff-list RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)',
    'EXECUTE'
  ),
  'anonymous role cannot call the public staff-update RPC'
);
select ok(
  not has_function_privilege('anon', 'private.list_firm_staff_for_admin()', 'EXECUTE'),
  'anonymous role cannot call the private staff-list helper'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)',
    'EXECUTE'
  ),
  'anonymous role cannot call the private staff-update helper'
);
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous role cannot resolve objects in the private schema'
);
select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated wrapper calls retain required private schema usage'
);

select * from finish();
rollback;

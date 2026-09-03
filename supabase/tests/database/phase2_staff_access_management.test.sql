create extension if not exists pgtap with schema extensions;

begin;
select plan(24);

select ok(
  to_regprocedure('public.list_firm_staff_for_admin()') is not null,
  'admin staff listing function exists'
);
select ok(
  to_regprocedure('public.admin_update_staff_membership(uuid,public.staff_role,public.membership_status)') is not null,
  'admin staff membership update function exists'
);
select ok(
  to_regprocedure('public.service_register_invited_staff(uuid,uuid,uuid,public.staff_role)') is not null,
  'service invitation registration function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.service_register_invited_staff(uuid,uuid,uuid,public.staff_role)',
    'EXECUTE'
  ),
  'authenticated users cannot execute service invitation registration directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.service_register_invited_staff(uuid,uuid,uuid,public.staff_role)',
    'EXECUTE'
  ),
  'service role can register invited staff'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-one@example.test', now(), now()),
  ('81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin-two@example.test', now(), now()),
  ('81000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'staff@example.test', now(), now()),
  ('81000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'other-admin@example.test', now(), now()),
  ('81000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'invited@example.test', now(), now());

insert into public.firms (id, name, slug, controller_name, privacy_policy_url)
values
  ('82000000-0000-0000-0000-000000000001', 'Staff Access Firm A', 'staff-access-firm-a', 'Staff Access Firm A', 'https://staff-access-a.example.test/privacy'),
  ('82000000-0000-0000-0000-000000000002', 'Staff Access Firm B', 'staff-access-firm-b', 'Staff Access Firm B', 'https://staff-access-b.example.test/privacy');

insert into public.staff_memberships (id, firm_id, auth_user_id, role, status)
values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('83000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'staff', 'active'),
  ('83000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000004', 'admin', 'active');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.list_firm_staff_for_admin()),
  3,
  'admin list returns only members of the current firm'
);
select is(
  (select count(*)::integer from public.list_firm_staff_for_admin() where email = 'other-admin@example.test'),
  0,
  'admin list never leaks another firm staff account'
);
select is(
  (select email from public.list_firm_staff_for_admin() where auth_user_id = '81000000-0000-0000-0000-000000000001'),
  'admin-one@example.test',
  'admin list exposes the firm staff work email to the administrator'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","aal":"aal1","role":"authenticated"}',
  true
);
select throws_ok(
  'select * from public.list_firm_staff_for_admin()',
  '42501',
  'An MFA-verified admin session is required',
  'AAL1 administrator cannot list staff accounts'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000003","aal":"aal2","role":"authenticated"}',
  true
);
select throws_ok(
  'select * from public.list_firm_staff_for_admin()',
  '42501',
  'An MFA-verified admin session is required',
  'ordinary staff cannot list staff accounts'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);
select lives_ok(
  $$select * from public.admin_update_staff_membership(
    '83000000-0000-0000-0000-000000000003',
    'senior'::public.staff_role,
    'active'::public.membership_status
  )$$,
  'administrator can change another staff member role'
);
reset role;

select is(
  (select role::text from public.staff_memberships where id = '83000000-0000-0000-0000-000000000003'),
  'senior',
  'role change persists'
);
select is(
  (select count(*)::integer from public.access_logs where action = 'STAFF_MEMBERSHIP_UPDATED'),
  1,
  'role change creates an access audit record'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);
select lives_ok(
  $$select * from public.admin_update_staff_membership(
    '83000000-0000-0000-0000-000000000003',
    'senior'::public.staff_role,
    'suspended'::public.membership_status
  )$$,
  'administrator can suspend another staff member'
);
reset role;
select is(
  (select status::text from public.staff_memberships where id = '83000000-0000-0000-0000-000000000003'),
  'suspended',
  'suspension immediately persists in the membership source of truth'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.admin_update_staff_membership(
    '83000000-0000-0000-0000-000000000001',
    'manager'::public.staff_role,
    'active'::public.membership_status
  )$$,
  'P0001',
  'Administrators cannot change their own role or access status',
  'administrator cannot demote their own account'
);
select throws_ok(
  $$select * from public.admin_update_staff_membership(
    '83000000-0000-0000-0000-000000000004',
    'staff'::public.staff_role,
    'active'::public.membership_status
  )$$,
  'P0001',
  'Staff membership not found',
  'administrator cannot mutate another firm membership'
);
select lives_ok(
  $$select * from public.admin_update_staff_membership(
    '83000000-0000-0000-0000-000000000003',
    'senior'::public.staff_role,
    'revoked'::public.membership_status
  )$$,
  'administrator can revoke another staff membership'
);
reset role;
select is(
  (select status::text from public.staff_memberships where id = '83000000-0000-0000-0000-000000000003'),
  'revoked',
  'revocation immediately removes workspace access'
);
select is(
  (select count(*)::integer from public.access_logs where action = 'STAFF_MEMBERSHIP_REVOKED'),
  1,
  'revocation creates a dedicated access audit record'
);

set local role service_role;
select lives_ok(
  $$select public.service_register_invited_staff(
    '82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000005',
    'manager'::public.staff_role
  )$$,
  'trusted server can register a newly invited auth user'
);
reset role;
select ok(
  exists (
    select 1
    from public.staff_memberships
    where auth_user_id = '81000000-0000-0000-0000-000000000005'
      and firm_id = '82000000-0000-0000-0000-000000000001'
      and role = 'manager'::public.staff_role
      and status = 'active'::public.membership_status
  ),
  'invited user receives the requested active firm membership'
);
select is(
  (select count(*)::integer from public.access_logs where action = 'STAFF_INVITED'),
  1,
  'staff invitation creates an access audit record'
);

set local role service_role;
select throws_ok(
  $$select public.service_register_invited_staff(
    '82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000005',
    'staff'::public.staff_role
  )$$,
  '23505',
  'Auth user already has a staff membership',
  'the same auth user cannot be provisioned into a second membership'
);
reset role;

select * from finish();
rollback;

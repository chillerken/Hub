-- Run only after the disposable handler test has seeded A and B.
-- Test authorization reproducing production RLS predicates in local Postgres.
-- All mutations are ROLLED BACK; this never connects to Supabase production.
\set ON_ERROR_STOP on
begin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
create function public.is_org_member(org_id uuid) returns boolean
 language sql stable set search_path to '' as $$
 select exists (
  select 1 from public.memberships m
  where m.organization_id=org_id
    and m.user_id=(select auth.uid())
    and m.active=true
 );
$$;
create function public.is_org_admin(org_id uuid) returns boolean
 language sql stable set search_path to '' as $$
 select exists (
  select 1 from public.memberships m
  where m.organization_id=org_id
    and m.user_id=(select auth.uid())
    and m.active=true
    and m.role in ('owner','admin')
 );
$$;
grant usage on schema public,auth to authenticated;
grant select on public.memberships,public.organizations,public.business_profiles,
 public.leads,public.conversations,public.messages,public.appointments,
 public.workflow_actions,public.tasks to authenticated;
grant update on public.business_profiles,public.leads,public.tasks to authenticated;
alter table public.memberships enable row level security;
alter table public.organizations enable row level security;
alter table public.business_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.workflow_actions enable row level security;
alter table public.tasks enable row level security;
create policy member_own on public.memberships for select to authenticated
 using(user_id=(select auth.uid()));
create policy org_self on public.organizations for select to authenticated
 using(public.is_org_member(id));
create policy profiles_select on public.business_profiles for select to authenticated
 using(public.is_org_member(organization_id));
create policy profiles_update on public.business_profiles for update to authenticated
 using(public.is_org_admin(organization_id))
 with check(public.is_org_admin(organization_id));
create policy leads_select on public.leads for select to authenticated
 using(public.is_org_member(organization_id));
create policy leads_update on public.leads for update to authenticated
 using(public.is_org_member(organization_id))
 with check(public.is_org_member(organization_id));
create policy appointment_select on public.appointments for select to authenticated
 using(public.is_org_member(organization_id));
create policy conversation_select on public.conversations for select to authenticated
 using(public.is_org_member(organization_id));
create policy message_select on public.messages for select to authenticated
 using(public.is_org_member(organization_id));
create policy action_select on public.workflow_actions for select to authenticated
 using(public.is_org_member(organization_id));
create policy task_select on public.tasks for select to authenticated
 using(public.is_org_member(organization_id));
create policy task_update on public.tasks for update to authenticated
 using(public.is_org_member(organization_id))
 with check(public.is_org_member(organization_id));

select public.assert_test(not has_table_privilege('authenticated','public.appointments','UPDATE'),
 'Authenticated callers cannot update appointment statuses through data API');
select public.assert_test(not has_table_privilege('authenticated','public.workflow_actions','INSERT'),
 'Authenticated callers cannot enqueue provider sends directly');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.assert_test((select count(*)=1 from public.organizations),
 'Tenant A owner reads only tenant A organization with RLS');
select public.assert_test((select count(*)=1 from public.business_profiles),
 'Tenant A owner reads only tenant A profile with RLS');
select public.assert_test((select count(*)>0 from public.leads),
 'Tenant A owner has access to their own leads');
select public.assert_test((select count(*)=0 from public.leads
 where organization_id='10000000-0000-4000-8000-000000000002'),
 'Tenant A cannot read tenant B leads');
select public.assert_test((select count(*)=0 from public.workflow_actions
 where organization_id='10000000-0000-4000-8000-000000000002'),
 'Tenant A cannot read tenant B workflow status or provider data');
with attempted as (
 update public.leads set summary='FORBIDDEN_CROSS_TENANT_WRITE'
 where organization_id='10000000-0000-4000-8000-000000000002'
 returning id
)
select public.assert_test((select count(*)=0 from attempted),
 'RLS rejects tenant A attempt to mutate tenant B lead');
with attempted as (
 update public.business_profiles set business_name='FORBIDDEN_CROSS_TENANT_WRITE'
 where organization_id='10000000-0000-4000-8000-000000000002'
 returning organization_id
)
select public.assert_test((select count(*)=0 from attempted),
 'RLS rejects tenant A owner attempt to update tenant B settings');
with allowed as (
 update public.business_profiles set business_name='Authorized synthetic update A'
 where organization_id='10000000-0000-4000-8000-000000000001'
 returning organization_id
)
select public.assert_test((select count(*)=1 from allowed),
 'Tenant A owner can edit their own profile');

reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.assert_test((select count(*)=1 from public.organizations),
 'Tenant A viewer retains read-only organization access');
with attempted as (
 update public.business_profiles set business_name='FORBIDDEN_VIEWER_WRITE'
 where organization_id='10000000-0000-4000-8000-000000000001'
 returning organization_id
)
select public.assert_test((select count(*)=0 from attempted),
 'RLS rejects non-admin viewer changes even to own organization settings');

reset role;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.assert_test((select count(*)=1 from public.organizations),
 'Tenant B owner reads only tenant B organization');
select public.assert_test((select count(*)=0 from public.messages
 where organization_id='10000000-0000-4000-8000-000000000001'),
 'Tenant B cannot read tenant A chat content');
with attempted as (
 update public.leads set summary='FORBIDDEN_FROM_B'
 where organization_id='10000000-0000-4000-8000-000000000001'
 returning id
)
select public.assert_test((select count(*)=0 from attempted),
 'RLS rejects tenant B writes into tenant A leads');
rollback;

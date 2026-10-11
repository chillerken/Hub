-- Disposable Supabase CLI local stack ONLY. Reconstructs selected live policies.
-- Local environment has real Supabase auth.uid(), authenticated and service_role.
-- All fixtures are synthetic and kept inside ephemeral GitHub Actions containers.
\set ON_ERROR_STOP on
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable set search_path to '' as $$
  select exists(select 1 from public.memberships m
   where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.active=true);
$$;
create or replace function public.is_org_admin(org_id uuid)
returns boolean language sql stable set search_path to '' as $$
  select exists(select 1 from public.memberships m
   where m.organization_id=org_id and m.user_id=(select auth.uid())
   and m.active=true and m.role in ('owner','admin'));
$$;
grant execute on function public.is_org_member(uuid),public.is_org_admin(uuid) to authenticated;
grant usage on schema public to anon,authenticated,service_role;
grant select on public.memberships,public.organizations,public.business_profiles,
 public.leads,public.conversations,public.messages,public.appointments,
 public.workflow_actions,public.tasks to authenticated;
grant update on public.business_profiles,public.leads,public.tasks to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

alter table public.memberships enable row level security;
alter table public.organizations enable row level security;
alter table public.business_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.workflow_actions enable row level security;
alter table public.tasks enable row level security;
create policy membership_select on public.memberships for select to authenticated
 using(user_id=(select auth.uid()));
create policy org_select on public.organizations for select to authenticated
 using(public.is_org_member(id));
create policy profile_select on public.business_profiles for select to authenticated
 using(public.is_org_member(organization_id));
create policy profile_update on public.business_profiles for update to authenticated
 using(public.is_org_admin(organization_id))
 with check(public.is_org_admin(organization_id));
create policy leads_select on public.leads for select to authenticated
 using(public.is_org_member(organization_id));
create policy leads_update on public.leads for update to authenticated
 using(public.is_org_member(organization_id))
 with check(public.is_org_member(organization_id));
create policy appointments_select on public.appointments for select to authenticated
 using(public.is_org_member(organization_id));
create policy conv_select on public.conversations for select to authenticated
 using(public.is_org_member(organization_id));
create policy msg_select on public.messages for select to authenticated
 using(public.is_org_member(organization_id));
create policy workflow_actions_select on public.workflow_actions for select to authenticated
 using(public.is_org_member(organization_id));
create policy tasks_select on public.tasks for select to authenticated
 using(public.is_org_member(organization_id));
create policy tasks_update on public.tasks for update to authenticated
 using(public.is_org_member(organization_id))
 with check(public.is_org_member(organization_id));

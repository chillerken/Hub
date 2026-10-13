
create schema if not exists jarvis_private;
revoke all on schema jarvis_private from public, anon, authenticated;

create table if not exists public.jarvis_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 150),
  objective text not null check (char_length(objective) between 3 and 1500),
  kind text not null check (kind in ('reminder','draft')),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','queued','needs_attention','completed','cancelled','failed')),
  scheduled_at timestamptz not null default now(),
  approved_at timestamptz,
  result_text text check (char_length(result_text)<=4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,owner_user_id,client_request_id)
);
create index if not exists jarvis_agent_tasks_due_idx
  on public.jarvis_agent_tasks(status,scheduled_at)
  where status='queued' and kind='reminder';
create index if not exists jarvis_agent_tasks_owner_idx
  on public.jarvis_agent_tasks(owner_user_id,created_at desc);

alter table public.jarvis_agent_tasks enable row level security;
create policy jarvis_agent_tasks_owner_select on public.jarvis_agent_tasks
 for select to authenticated
 using (owner_user_id=(select auth.uid()) and exists (
  select 1 from public.memberships m
  where m.organization_id=jarvis_agent_tasks.organization_id
    and m.user_id=(select auth.uid()) and m.active
    and m.role in ('owner','admin')));
create policy jarvis_agent_tasks_owner_insert on public.jarvis_agent_tasks
 for insert to authenticated
 with check (owner_user_id=(select auth.uid()) and status='pending_approval'
   and approved_at is null and result_text is null
   and exists (select 1 from public.memberships m
    where m.organization_id=jarvis_agent_tasks.organization_id
      and m.user_id=(select auth.uid()) and m.active
      and m.role in ('owner','admin')));
create policy jarvis_agent_tasks_owner_update on public.jarvis_agent_tasks
 for update to authenticated
 using (owner_user_id=(select auth.uid()) and exists (
   select 1 from public.memberships m
   where m.organization_id=jarvis_agent_tasks.organization_id
     and m.user_id=(select auth.uid()) and m.active
     and m.role in ('owner','admin')))
 with check (owner_user_id=(select auth.uid()) and exists (
   select 1 from public.memberships m
   where m.organization_id=jarvis_agent_tasks.organization_id
     and m.user_id=(select auth.uid()) and m.active
     and m.role in ('owner','admin')));
revoke all on public.jarvis_agent_tasks from anon, authenticated;
grant select, insert on public.jarvis_agent_tasks to authenticated;
grant update(status,approved_at,result_text,updated_at) on public.jarvis_agent_tasks to authenticated;

create table if not exists public.jarvis_agent_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.jarvis_agent_tasks(id) on delete cascade,
  organization_id uuid not null,
  owner_user_id uuid not null,
  actor_user_id uuid,
  old_status text,
  new_status text not null,
  logged_at timestamptz not null default now()
);
create index if not exists jarvis_agent_events_task_idx on public.jarvis_agent_events(task_id,logged_at desc);
alter table public.jarvis_agent_events enable row level security;
create policy jarvis_agent_events_read on public.jarvis_agent_events
  for select to authenticated
  using (owner_user_id=(select auth.uid())
    and exists (select 1 from public.memberships m
      where m.organization_id=jarvis_agent_events.organization_id
      and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','admin')));
revoke all on public.jarvis_agent_events from anon, authenticated;
grant select on public.jarvis_agent_events to authenticated;

create or replace function jarvis_private.log_task_transition()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $$
begin
  if TG_OP='INSERT' or old.status is distinct from new.status then
    insert into public.jarvis_agent_events
      (task_id,organization_id,owner_user_id,actor_user_id,old_status,new_status)
    values (new.id,new.organization_id,new.owner_user_id,auth.uid(),
      case when TG_OP='INSERT' then null else old.status end,new.status);
  end if;
  return new;
end $$;
revoke all on function jarvis_private.log_task_transition() from public, anon, authenticated;
create trigger jarvis_agent_audit after insert or update on public.jarvis_agent_tasks
for each row execute function jarvis_private.log_task_transition();

create or replace function jarvis_private.activate_due_reminders()
returns void language plpgsql security definer
set search_path=pg_catalog,public
as $$
begin
  update public.jarvis_agent_tasks
  set status='needs_attention',
      result_text='De geplande herinnering is nu aan de beurt. Er is geen extern bericht verzonden.',
      updated_at=now()
  where status='queued' and kind='reminder' and scheduled_at<=now();
end $$;
revoke all on function jarvis_private.activate_due_reminders() from public, anon, authenticated;
select cron.schedule('jarvis_agent_due_reminders_v1','*/5 * * * *',
  'select jarvis_private.activate_due_reminders();');

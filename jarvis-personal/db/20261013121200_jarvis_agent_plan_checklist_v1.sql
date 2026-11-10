-- Already applied in Reception AI Production, 2026-10-13.
-- Add an explicit human-executed plan workflow without changing existing reminders.
alter table public.jarvis_agent_tasks
  drop constraint jarvis_agent_tasks_kind_check;
alter table public.jarvis_agent_tasks
  add constraint jarvis_agent_tasks_kind_check
  check (kind in ('reminder','draft','plan'));
alter table public.jarvis_agent_tasks
  add column plan_progress jsonb not null default '{}'::jsonb;
alter table public.jarvis_agent_tasks
  add constraint jarvis_agent_plan_progress_safe_check
  check (jsonb_typeof(plan_progress)='object' and pg_column_size(plan_progress)<=1024);
grant update(plan_progress) on public.jarvis_agent_tasks to authenticated;

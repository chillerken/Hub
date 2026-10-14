-- Applied to existing Reception AI Production on 2026-10-13.
-- Ensure no queued/completed agent instruction bypasses explicit owner approval.
alter table public.jarvis_agent_tasks
  add constraint jarvis_agent_approved_before_execution_v1
  check (status not in ('queued','needs_attention','completed') or approved_at is not null);

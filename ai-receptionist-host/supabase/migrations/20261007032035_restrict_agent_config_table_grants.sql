-- Restrict Sales/Marketing agent configuration tables to trusted server-side callers.
-- Browser roles are intentionally denied by RLS and do not need table privileges.

revoke all on table public.sales_agent_configs from anon, authenticated;
revoke all on table public.marketing_agent_configs from anon, authenticated;

grant select, insert, update, delete, references, trigger, truncate
  on table public.sales_agent_configs to service_role;

grant select, insert, update, delete, references, trigger, truncate
  on table public.marketing_agent_configs to service_role;

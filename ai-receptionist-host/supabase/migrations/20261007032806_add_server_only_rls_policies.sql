-- Make intentional server-only RLS explicit for quota and plan catalog tables.

drop policy if exists ai_usage_daily_no_direct_access on public.ai_usage_daily;
create policy ai_usage_daily_no_direct_access
on public.ai_usage_daily
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists reception_ai_plan_catalog_no_direct_access on public.reception_ai_plan_catalog;
create policy reception_ai_plan_catalog_no_direct_access
on public.reception_ai_plan_catalog
for all
to anon, authenticated
using (false)
with check (false);

-- Add explicit one-time setup fees to the Reception AI commercial plan catalog.
-- Public plan IDs stay stable for entitlement/webhook compatibility.

alter table public.reception_ai_plan_catalog
  add column if not exists setup_cents integer not null default 0;

update public.reception_ai_plan_catalog
set setup_cents = case plan
  when 'starter' then 29900
  when 'pro' then 49900
  when 'business' then 75000
  else setup_cents
end,
updated_at = now()
where plan in ('starter','pro','business');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.reception_ai_plan_catalog'::regclass
      and conname='reception_ai_plan_catalog_setup_cents_check'
  ) then
    alter table public.reception_ai_plan_catalog
      add constraint reception_ai_plan_catalog_setup_cents_check
      check (setup_cents >= 0);
  end if;
end $$;

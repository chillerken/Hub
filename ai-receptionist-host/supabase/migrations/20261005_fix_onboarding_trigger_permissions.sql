-- Fix settings save failure caused by onboarding trigger running with tenant privileges.
-- Keep organizations protected from direct tenant UPDATE while allowing the trigger
-- to transition an organization from onboarding to active after a valid profile save.

create schema if not exists private;

create or replace function private.refresh_onboarding_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.business_name is not null and length(trim(new.business_name)) > 0
     and new.description is not null and length(trim(new.description)) > 0
     and jsonb_typeof(coalesce(new.services,'[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(new.services,'[]'::jsonb)) > 0
     and jsonb_typeof(coalesce(new.qualification_questions,'[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(new.qualification_questions,'[]'::jsonb)) > 0
     and coalesce(new.widget_enabled,false) = true then
    update public.organizations
       set status = 'active',
           updated_at = now()
     where id = new.organization_id
       and status = 'onboarding';
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_onboarding_status() from public, anon, authenticated;

drop trigger if exists trg_refresh_onboarding_status on public.business_profiles;
create trigger trg_refresh_onboarding_status
after insert or update on public.business_profiles
for each row execute function private.refresh_onboarding_status();

drop function if exists public.refresh_onboarding_status();

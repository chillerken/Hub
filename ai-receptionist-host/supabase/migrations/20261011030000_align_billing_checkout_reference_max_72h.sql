-- Align create_billing_checkout_ref RPC with billing-link v7's 72-hour checkout reference.
-- Verified source of truth: production pg_get_functiondef, 2026-10-11.
-- This changes ONLY the maximum expiry from 4h to 72h.
-- IMPORTANT: apply only after separate approval and rollback capture.
CREATE OR REPLACE FUNCTION public.create_billing_checkout_ref(p_token_hash text, p_organization_id uuid, p_user_id uuid, p_plan text, p_expires_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_plan not in ('starter','pro','business') then
    raise exception 'invalid plan';
  end if;
  if p_expires_at <= now() or p_expires_at > now()+interval '72 hours' then
    raise exception 'invalid billing reference expiry';
  end if;
  if not exists (
    select 1 from public.memberships
    where organization_id=p_organization_id
      and user_id=p_user_id
      and active=true
      and role in ('owner','admin')
  ) then
    raise exception 'owner or admin membership required';
  end if;

  delete from private.billing_checkout_refs
  where expires_at < now()-interval '1 day'
     or used_at < now()-interval '1 day';

  insert into private.billing_checkout_refs(
    token_hash,organization_id,user_id,plan,expires_at
  )
  values(
    p_token_hash,p_organization_id,p_user_id,p_plan,p_expires_at
  );
end;
$function$;

-- Preserve strict function execution grants.
REVOKE ALL ON FUNCTION public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz) TO service_role;

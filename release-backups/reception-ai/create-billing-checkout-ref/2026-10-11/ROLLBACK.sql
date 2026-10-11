-- Exact function body extracted from production pg_get_functiondef before PR #33 release.
-- Restore only as part of a coordinated rollback of billing-link to a compatible TTL.
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
  if p_expires_at <= now() or p_expires_at > now()+interval '4 hours' then
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

-- Verified owner was postgres; restrict to exactly postgres and service_role.
ALTER FUNCTION public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz) TO service_role;

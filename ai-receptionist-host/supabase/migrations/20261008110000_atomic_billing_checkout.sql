create or replace function public.apply_billing_checkout_ref(
 p_token_hash text,p_plan text,p_subscription_status text,p_customer_id text,p_subscription_id text
) returns table(organization_id uuid)
language plpgsql security definer set search_path=''
as $function$
declare r private.billing_checkout_refs%rowtype; o public.organizations%rowtype;
begin
 if p_plan not in ('starter','pro','business') or p_subscription_status not in ('active','trialing','past_due','incomplete')
    or coalesce(p_customer_id,'')='' or coalesce(p_subscription_id,'')='' then return; end if;
 select * into r from private.billing_checkout_refs where token_hash=p_token_hash and plan=p_plan for update;
 if not found then return; end if;
 select * into o from public.organizations where id=r.organization_id for update;
 if not found then raise exception 'Billing reference organization missing'; end if;
 if r.used_at is not null then
   if o.stripe_customer_id=p_customer_id and o.stripe_subscription_id=p_subscription_id then
     return query select r.organization_id;
   end if;
   return;
 end if;
 if r.expires_at<=now() then return; end if;
 update public.organizations set plan=p_plan,subscription_status=p_subscription_status,
   stripe_customer_id=p_customer_id,stripe_subscription_id=p_subscription_id,updated_at=now()
 where id=r.organization_id;
 update private.billing_checkout_refs set used_at=now() where token_hash=p_token_hash;
 return query select r.organization_id;
end;
$function$;
revoke all on function public.apply_billing_checkout_ref(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_billing_checkout_ref(text,text,text,text,text) to service_role;

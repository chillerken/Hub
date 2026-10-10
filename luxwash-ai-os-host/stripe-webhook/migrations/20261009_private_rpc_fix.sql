-- Draft AI Creator Stripe repair. Safe to review; NOT yet applied to production.
-- Keep private tables out of exposed API schemas. Expose only service_role-only
-- SECURITY INVOKER RPCs: no public SECURITY DEFINER privilege escalation.
-- The Edge Function must verify the Stripe HMAC before calling record_paid.
-- Payment link/product/currency/price were verified read-only in Stripe on 2026-10-10.

-- The service role cannot query private.* via PostgREST directly when the
-- schema is not exposed, but a public invoker RPC may read explicitly granted
-- private relations. Grants do not make 'private' an exposed API schema.
grant usage on schema private to service_role;
grant select on private.ai_creator_config to service_role;
grant select, insert on private.ai_creator_entitlements to service_role;

create or replace function public.ai_creator_webhook_secret()
returns text
language sql stable security invoker
set search_path = ''
as $$
  select nullif(btrim(value),'')
  from private.ai_creator_config
  where key = 'stripe_webhook_secret'
  limit 1
$$;
revoke all on function public.ai_creator_webhook_secret() from public, anon, authenticated;
grant execute on function public.ai_creator_webhook_secret() to service_role;

create or replace function public.ai_creator_webhook_record_paid(p_receipt jsonb)
returns boolean
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_receipt->>'email', '')));
  v_event_id text := btrim(coalesce(p_receipt->>'stripe_event_id', ''));
  v_session_id text := btrim(coalesce(p_receipt->>'stripe_checkout_session_id', ''));
  v_amount bigint;
  v_currency text;
  v_payment_link text;
  v_inserted integer;
begin
  if p_receipt is null or length(p_receipt::text) > 12000 then
    raise exception 'Invalid receipt payload';
  end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 then
    raise exception 'Invalid receipt email';
  end if;
  if v_event_id !~ '^evt_[A-Za-z0-9]+$' or v_session_id !~ '^cs_[A-Za-z0-9_]+$' then
    raise exception 'Invalid Stripe identifiers';
  end if;
  if length(v_event_id)>140 or length(v_session_id)>255 then
    raise exception 'Stripe identifier too long';
  end if;
  v_amount := nullif(p_receipt->>'amount_total','')::bigint;
  v_currency := lower(nullif(btrim(coalesce(p_receipt->>'currency','')),''));
  if (v_amount is not null and v_amount < 0) or
     (v_currency is not null and v_currency !~ '^[a-z]{3}
  -- Deduplicate both Stripe event and checkout session. Never re-activate a
  -- revoked/refunded entitlement just because Stripe retried an old event.
  insert into private.ai_creator_entitlements
    (email, stripe_event_id, stripe_checkout_session_id, stripe_payment_intent_id,
     stripe_customer_id, product_id, payment_link_id, amount_total, currency, status, updated_at)
  values
    (v_email, v_event_id, v_session_id,
     nullif(p_receipt->>'stripe_payment_intent_id',''),
     nullif(p_receipt->>'stripe_customer_id',''),
     'prod_VN3yN8r2Y15Pwy',
     nullif(p_receipt->>'payment_link_id',''),
     v_amount, v_currency, 'active', now())
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end
$$;
revoke all on function public.ai_creator_webhook_record_paid(jsonb) from public, anon, authenticated;
grant execute on function public.ai_creator_webhook_record_paid(jsonb) to service_role;
) then
    raise exception 'Invalid receipt amount or currency';
  end if;
  -- Defense in depth: do not grant beta access for any unrelated Stripe
  -- product. Verified live Stripe line item: €19, EUR, one-time payment link.
  v_payment_link := nullif(btrim(coalesce(p_receipt->>'payment_link_id','')),'');
  if v_payment_link is distinct from 'plink_1UMJqZKMkGczYQpSPUHgo6Ij'
     or v_amount is distinct from 1900
     or v_currency is distinct from 'eur' then
    raise exception 'Unapproved AI Creator payment receipt';
  end if;
  -- Deduplicate both Stripe event and checkout session. Never re-activate a
  -- revoked/refunded entitlement just because Stripe retried an old event.
  insert into private.ai_creator_entitlements
    (email, stripe_event_id, stripe_checkout_session_id, stripe_payment_intent_id,
     stripe_customer_id, product_id, payment_link_id, amount_total, currency, status, updated_at)
  values
    (v_email, v_event_id, v_session_id,
     nullif(p_receipt->>'stripe_payment_intent_id',''),
     nullif(p_receipt->>'stripe_customer_id',''),
     'prod_VN3yN8r2Y15Pwy',
     nullif(p_receipt->>'payment_link_id',''),
     v_amount, v_currency, 'active', now())
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end
$$;
revoke all on function public.ai_creator_webhook_record_paid(jsonb) from public, anon, authenticated;
grant execute on function public.ai_creator_webhook_record_paid(jsonb) to service_role;

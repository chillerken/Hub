-- AI Creator Stripe: keep private tables private; expose only service_role-only RPCs.
-- Payment entitlements are inserted only after signature verification in the Edge Function.
create or replace function public.ai_creator_webhook_secret()
returns text
language sql stable security definer
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
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_receipt->>'email', '')));
  v_event_id text := btrim(coalesce(p_receipt->>'stripe_event_id', ''));
  v_session_id text := btrim(coalesce(p_receipt->>'stripe_checkout_session_id', ''));
  v_amount bigint;
  v_currency text;
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
     (v_currency is not null and v_currency !~ '^[a-z]{3}$') then
    raise exception 'Invalid receipt amount or currency';
  end if;
  -- Deduplicate both event-id and checkout-session-id.
  -- DO NOTHING also prevents replay from reactivating revoked/refunded access.
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

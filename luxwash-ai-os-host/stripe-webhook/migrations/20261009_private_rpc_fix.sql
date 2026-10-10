-- AI Creator billing repair candidate: NOT DEPLOYED TO PRODUCTION.
-- A public service_role-only SECURITY INVOKER RPC reads private config.
-- Signed event verification must happen in Edge Function before record_paid.
-- Payment link product/price verified read-only against Stripe Luxdesign 2026-10-10.
-- Expected: AI Creator Founding Beta, EUR 19 one-time payment.

GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.ai_creator_config TO service_role;
GRANT SELECT, INSERT ON private.ai_creator_entitlements TO service_role;

CREATE OR REPLACE FUNCTION public.ai_creator_webhook_secret()
RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $creator_secret$
  SELECT NULLIF(btrim(value), '')
  FROM private.ai_creator_config
  WHERE key='stripe_webhook_secret'
  LIMIT 1
$creator_secret$;

REVOKE ALL ON FUNCTION public.ai_creator_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_creator_webhook_secret() TO service_role;

CREATE OR REPLACE FUNCTION public.ai_creator_webhook_record_paid(p_receipt jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $record_paid$
DECLARE
  v_email text := lower(btrim(coalesce(p_receipt->>'email', '')));
  v_event_id text := btrim(coalesce(p_receipt->>'stripe_event_id', ''));
  v_session_id text := btrim(coalesce(p_receipt->>'stripe_checkout_session_id', ''));
  v_payment_link text := nullif(btrim(coalesce(p_receipt->>'payment_link_id','')), '');
  v_amount bigint;
  v_currency text;
  v_inserted integer;
BEGIN
  IF p_receipt IS NULL OR length(p_receipt::text)>12000 THEN
    RAISE EXCEPTION 'Invalid receipt payload';
  END IF;
  IF v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR length(v_email)>254 THEN
    RAISE EXCEPTION 'Invalid receipt email';
  END IF;
  IF v_event_id !~ '^evt_[A-Za-z0-9]+$' OR v_session_id !~ '^cs_[A-Za-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid Stripe identifiers';
  END IF;
  IF length(v_event_id)>140 OR length(v_session_id)>255 THEN
    RAISE EXCEPTION 'Stripe identifier too long';
  END IF;

  v_amount := nullif(p_receipt->>'amount_total','')::bigint;
  v_currency := lower(nullif(btrim(coalesce(p_receipt->>'currency','')),''));
  -- Defense in depth: never grant AI Creator rights for unrelated
  -- signed Stripe events (including Reception AI, TafelGo, ReplyLoop).
  IF v_payment_link IS DISTINCT FROM 'plink_1UMJqZKMkGczYQpSPUHgo6Ij'
     OR v_amount IS DISTINCT FROM 1900
     OR v_currency IS DISTINCT FROM 'eur' THEN
    RAISE EXCEPTION 'Unapproved AI Creator payment receipt';
  END IF;

  -- Atomic insert, no UPSERT. Duplicate event/session/email cannot
  -- re-activate a refunded, revoked or duplicate entitlement.
  INSERT INTO private.ai_creator_entitlements
    (email, stripe_event_id, stripe_checkout_session_id, stripe_payment_intent_id,
     stripe_customer_id, product_id, payment_link_id, amount_total, currency, status, updated_at)
  VALUES
    (v_email, v_event_id, v_session_id,
     nullif(p_receipt->>'stripe_payment_intent_id',''),
     nullif(p_receipt->>'stripe_customer_id',''),
     'prod_VN3yN8r2Y15Pwy',
     v_payment_link, v_amount, v_currency, 'active', now())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted=1;
END;
$record_paid$;

REVOKE ALL ON FUNCTION public.ai_creator_webhook_record_paid(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_creator_webhook_record_paid(jsonb) TO service_role;

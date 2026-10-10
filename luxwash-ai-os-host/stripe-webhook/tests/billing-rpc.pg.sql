\set ON_ERROR_STOP on
-- Isolated fixtures only. No real Stripe calls, customer records, or secrets.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;

CREATE TABLE private.ai_creator_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE private.ai_creator_entitlements (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  stripe_event_id text NOT NULL UNIQUE,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  product_id text,
  payment_link_id text,
  amount_total bigint,
  currency text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_creator_entitlements_active_email_idx
  ON private.ai_creator_entitlements(lower(email)) WHERE status='active';
INSERT INTO private.ai_creator_config(key,value) VALUES ('stripe_webhook_secret','whsec_test_only_fixture');

\ir ../migrations/20261009_private_rpc_fix.sql

DO $$
BEGIN
  IF has_function_privilege('anon','public.ai_creator_webhook_secret()','EXECUTE') OR
     has_function_privilege('authenticated','public.ai_creator_webhook_secret()','EXECUTE') OR
     has_function_privilege('anon','public.ai_creator_webhook_record_paid(jsonb)','EXECUTE') OR
     has_function_privilege('authenticated','public.ai_creator_webhook_record_paid(jsonb)','EXECUTE') THEN
     RAISE EXCEPTION 'Public roles can invoke billing RPC';
  END IF;
  IF NOT has_function_privilege('service_role','public.ai_creator_webhook_secret()','EXECUTE')
     OR NOT has_function_privilege('service_role','public.ai_creator_webhook_record_paid(jsonb)','EXECUTE') THEN
     RAISE EXCEPTION 'service_role billing RPC privileges missing';
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid='public.ai_creator_webhook_record_paid(jsonb)'::regprocedure) THEN
     RAISE EXCEPTION 'Billing function must be SECURITY INVOKER';
  END IF;
END $$;

SET ROLE service_role;
DO $$
DECLARE
  receipt jsonb := jsonb_build_object(
     'email', 'synthetic@example.test',
     'stripe_event_id', 'evt_SYNTHETIC0001',
     'stripe_checkout_session_id', 'cs_live_SYNTHETIC0001',
     'payment_link_id', 'plink_1UMJqZKMkGczYQpSPUHgo6Ij',
     'amount_total', 1900,
     'currency', 'eur');
  rejected boolean;
  inserted boolean;
BEGIN
  IF public.ai_creator_webhook_secret() <> 'whsec_test_only_fixture' THEN
    RAISE EXCEPTION 'Unable to read synthetic secret with service role';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.ai_creator_webhook_record_paid(receipt||'{"payment_link_id":"plink_wrong"}'::jsonb);
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Unrelated payment link accepted'; END IF;

  rejected := false;
  BEGIN
    PERFORM public.ai_creator_webhook_record_paid(receipt||'{"amount_total":100}'::jsonb);
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Wrong amount accepted'; END IF;

  rejected := false;
  BEGIN
    PERFORM public.ai_creator_webhook_record_paid(receipt||'{"currency":"usd"}'::jsonb);
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Wrong currency accepted'; END IF;

  SELECT public.ai_creator_webhook_record_paid(receipt) INTO inserted;
  IF inserted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Good synthetic payment was not recorded'; END IF;
  SELECT public.ai_creator_webhook_record_paid(receipt) INTO inserted;
  IF inserted IS DISTINCT FROM false THEN RAISE EXCEPTION 'Exact Stripe event replay is not idempotent'; END IF;

  UPDATE private.ai_creator_entitlements SET status='revoked' WHERE stripe_event_id='evt_SYNTHETIC0001';
  SELECT public.ai_creator_webhook_record_paid(receipt) INTO inserted;
  IF inserted IS DISTINCT FROM false OR
     (SELECT status FROM private.ai_creator_entitlements WHERE stripe_event_id='evt_SYNTHETIC0001') <> 'revoked' THEN
     RAISE EXCEPTION 'Revoked access was reactivated by replay';
  END IF;
  IF (SELECT count(*) FROM private.ai_creator_entitlements) <> 1 THEN
     RAISE EXCEPTION 'Duplicate entitlement records created';
  END IF;
  RAISE NOTICE 'PASS: service-only RPC, strict link/amount/currency, replay and revoke protection';
END $$;
RESET ROLE;

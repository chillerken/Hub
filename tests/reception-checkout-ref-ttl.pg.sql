-- Isolated PostgreSQL fixture: NO production database or Stripe calls.
-- Run: psql -v ON_ERROR_STOP=1 -f tests/reception-checkout-ref-ttl.pg.sql

CREATE SCHEMA private;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.memberships (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  active boolean NOT NULL,
  role text NOT NULL
);

CREATE TABLE private.billing_checkout_refs (
  token_hash text PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  plan text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Execute the EXACT pending production migration against this disposable fixture.
\i ai-receptionist-host/supabase/migrations/20261011030000_align_billing_checkout_reference_max_72h.sql

DO $verify$
DECLARE
  org uuid := '10000000-0000-4000-8000-000000000011';
  usr uuid := '10000000-0000-4000-8000-000000000012';
  outsider uuid := '10000000-0000-4000-8000-000000000099';
  got_error boolean;
BEGIN
  IF NOT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='create_billing_checkout_ref') THEN
    RAISE EXCEPTION 'SECURITY DEFINER was removed';
  END IF;

  IF has_function_privilege('anon','public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz)','EXECUTE')
    OR has_function_privilege('authenticated','public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC execution grants are unsafe';
  END IF;

  INSERT INTO public.memberships(organization_id,user_id,active,role)
    VALUES(org,usr,true,'owner');

  PERFORM public.create_billing_checkout_ref(
    'good_70_hours',org,usr,'starter',now()+interval '70 hours');
  IF (SELECT count(*) FROM private.billing_checkout_refs WHERE token_hash='good_70_hours')<>1 THEN
    RAISE EXCEPTION '70 hour checkout was rejected';
  END IF;

  -- Simulates the live billing-link calculation at the exact declared limit.
  PERFORM public.create_billing_checkout_ref(
    'good_72_hours',org,usr,'starter',now()+interval '72 hours');
  IF (SELECT count(*) FROM private.billing_checkout_refs WHERE token_hash='good_72_hours')<>1 THEN
    RAISE EXCEPTION '72 hour checkout was rejected';
  END IF;

  got_error := false;
  BEGIN
    PERFORM public.create_billing_checkout_ref(
      'bad_73_hours',org,usr,'starter',now()+interval '73 hours');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid billing reference expiry' THEN RAISE; END IF;
    got_error := true;
  END;
  IF NOT got_error THEN RAISE EXCEPTION '73 hour checkout was accepted'; END IF;

  got_error := false;
  BEGIN
    PERFORM public.create_billing_checkout_ref(
      'bad_role',org,outsider,'starter',now()+interval '71 hours');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'owner or admin membership required' THEN RAISE; END IF;
    got_error := true;
  END;
  IF NOT got_error THEN RAISE EXCEPTION 'unauthorized membership was accepted'; END IF;

  got_error := false;
  BEGIN
    PERFORM public.create_billing_checkout_ref(
      'bad_plan',org,usr,'unlisted',now()+interval '71 hours');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid plan' THEN RAISE; END IF;
    got_error := true;
  END;
  IF NOT got_error THEN RAISE EXCEPTION 'invalid plan was accepted'; END IF;

  RAISE NOTICE 'PASS: 70h/72h allowed; 73h, invalid plan and nonmember rejected; grants preserved.';
END
$verify$;

SELECT count(*) AS authorized_refs_from_fixture
FROM private.billing_checkout_refs;

-- Disposable PostgreSQL 16 fixture: no connection to Supabase production.
CREATE SCHEMA private;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE private.billing_checkout_refs(
 token_hash text PRIMARY KEY, organization_id uuid NOT NULL,
 user_id uuid NOT NULL, plan text NOT NULL,
 expires_at timestamptz NOT NULL, used_at timestamptz
);

\i ai-receptionist-host/supabase/migrations/20261011060000_readonly_checkout_reference_review.sql

INSERT INTO private.billing_checkout_refs(
 token_hash,organization_id,user_id,plan,expires_at,used_at
)VALUES(
 repeat('a',64),
 '10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002',
 'starter',now()+interval '3 hours',null
);

DO $verify$
DECLARE
 fn_oid oid;
 ref record;
BEGIN
 SELECT p.oid INTO fn_oid FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
 AND p.proname='lookup_billing_checkout_reference_for_review';

 IF fn_oid IS NULL THEN RAISE EXCEPTION 'lookup RPC missing'; END IF;
 IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=fn_oid) THEN
   RAISE EXCEPTION 'review RPC lacks SECURITY DEFINER';
 END IF;
 IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid=fn_oid) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
   RAISE EXCEPTION 'review RPC search path unsafe';
 END IF;
 IF has_function_privilege('anon',fn_oid,'EXECUTE')
    OR has_function_privilege('authenticated',fn_oid,'EXECUTE')
    OR NOT has_function_privilege('service_role',fn_oid,'EXECUTE') THEN
   RAISE EXCEPTION 'RPC execution grants unsafe';
 END IF;

 SELECT * INTO ref FROM public.lookup_billing_checkout_reference_for_review(repeat('a',64));
 IF ref.organization_id <> '10000000-0000-4000-8000-000000000001'::uuid
    OR ref.plan <> 'starter' THEN
   RAISE EXCEPTION 'reference lookup wrong';
 END IF;

 IF EXISTS(SELECT 1 FROM public.lookup_billing_checkout_reference_for_review(repeat('b',64)))
 OR EXISTS(SELECT 1 FROM public.lookup_billing_checkout_reference_for_review('abc'))
 OR EXISTS(SELECT 1 FROM public.lookup_billing_checkout_reference_for_review(repeat('a',65))) THEN
   RAISE EXCEPTION 'invalid reference matched';
 END IF;

 IF (SELECT count(*) FROM private.billing_checkout_refs) <> 1 THEN
   RAISE EXCEPTION 'lookup mutated reference table';
 END IF;
 RAISE NOTICE 'PASS: hashed reference read only; service_role only; private schema not exposed.';
END
$verify$;

-- Actual executor checks, not just introspection.
SET ROLE service_role;
SELECT count(*) AS service_role_can_lookup
FROM public.lookup_billing_checkout_reference_for_review(repeat('a',64));
RESET ROLE;

-- Disposable PostgreSQL contract fixture. NEVER run against real Supabase.
CREATE SCHEMA private;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.organizations (
 id uuid PRIMARY KEY, is_internal boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active', plan text NOT NULL DEFAULT 'trial',
 subscription_status text NOT NULL DEFAULT 'trialing',
 stripe_customer_id text, stripe_subscription_id text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.memberships (
 organization_id uuid NOT NULL, user_id uuid NOT NULL,
 active boolean NOT NULL,role text NOT NULL
);
CREATE TABLE private.billing_checkout_refs(
 token_hash text PRIMARY KEY,
 organization_id uuid NOT NULL, user_id uuid NOT NULL,
 plan text NOT NULL, expires_at timestamptz NOT NULL,
 used_at timestamptz
);
CREATE TABLE public.stripe_events (
 id text PRIMARY KEY, event_type text NOT NULL,status text NOT NULL,
 last_error text,processed_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

\i ai-receptionist-host/supabase/migrations/20261011093000_atomic_paid_checkout_recovery.sql

INSERT INTO public.organizations(id,is_internal,status,plan,subscription_status)
VALUES
('10000000-0000-4000-8000-000000000001',true,'active','trial','active'),
('10000000-0000-4000-8000-000000000002',false,'active','trial','trialing'),
('10000000-0000-4000-8000-000000000003',false,'active','trial','trialing'),
('10000000-0000-4000-8000-000000000004',false,'active','starter','canceled');
INSERT INTO public.memberships(organization_id,user_id,active,role) VALUES
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true,'owner'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',true,'owner');
INSERT INTO private.billing_checkout_refs(token_hash,organization_id,user_id,plan,expires_at)
VALUES
(repeat('a',64),'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','starter',now()-interval '1 hour'),
(repeat('b',64),'10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','starter',now()-interval '1 hour'),
(repeat('c',64),'10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','starter',now()-interval '1 hour');
INSERT INTO public.stripe_events(id,event_type,status,last_error) VALUES
('evt_fixture123456789','checkout.session.completed','failed','paid_checkout_unlinked: expired reference'),
('evt_fixtureother12345','checkout.session.completed','failed','paid_checkout_unlinked: another tenant'),
('evt_fixturesubconflict','checkout.session.completed','failed','paid_checkout_unlinked: sub conflict'),
('evt_fixturecancelled12','checkout.session.completed','failed','paid_checkout_unlinked: terminal org'),
('evt_fixturewrongtype12','invoice.paid','failed','paid_checkout_unlinked: invoice'),
('evt_fixturepaidagain123','checkout.session.completed','processed',NULL);

DO $test$
DECLARE
 org uuid:='10000000-0000-4000-8000-000000000002';
 other uuid:='10000000-0000-4000-8000-000000000003';
 terminal uuid:='10000000-0000-4000-8000-000000000004';
 op uuid:='20000000-0000-4000-8000-000000000001';
 outsider uuid:='20000000-0000-4000-8000-000000000002';
 x text;
 error text;
 audit_count int;
BEGIN
 IF has_function_privilege('anon',
     'public.commit_paid_checkout_recovery(text,text,text,uuid,uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated',
     'public.commit_paid_checkout_recovery(text,text,text,uuid,uuid,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role',
     'public.commit_paid_checkout_recovery(text,text,text,uuid,uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'operator-only RPC grants are unsafe';
 END IF;
 IF (SELECT p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='commit_paid_checkout_recovery')
    IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'RPC search path is unsafe';
 END IF;

 -- Reject a tenant owner who is not a platform operator.
 error:='';
 BEGIN
  PERFORM public.commit_paid_checkout_recovery('evt_fixture123456789',
   'cs_test_fixture123456789',repeat('a',64),org,outsider,'starter','cus_fixture123','sub_fixture123');
 EXCEPTION WHEN OTHERS THEN error:=SQLERRM; END;
 IF error<>'recovery_operator_not_authorized' THEN RAISE EXCEPTION 'tenant owner not blocked: %',error;END IF;

 -- Even a platform operator cannot supply an unrelated organization.
 error:='';
 BEGIN
  PERFORM public.commit_paid_checkout_recovery('evt_fixture123456789',
   'cs_test_fixture123456789',repeat('a',64),other,op,'starter','cus_fixture123','sub_fixture123');
 EXCEPTION WHEN OTHERS THEN error:=SQLERRM; END;
 IF error<>'recovery_reference_organization_mismatch' THEN RAISE EXCEPTION 'tenant mismatch not blocked: %',error;END IF;

 -- Event and original reference must exist and belong to the tenant.
 error:='';
 BEGIN
  PERFORM public.commit_paid_checkout_recovery('evt_fixturewrongtype12',
   'cs_test_fixture123456789',repeat('a',64),org,op,'starter','cus_fixture123','sub_fixture123');
 EXCEPTION WHEN OTHERS THEN error:=SQLERRM; END;
 IF error<>'recovery_event_not_found' THEN RAISE EXCEPTION 'invoice type not blocked: %',error;END IF;

 error:='';
 BEGIN
  PERFORM public.commit_paid_checkout_recovery('evt_fixturesubconflict',
   'cs_test_fixture123456789',repeat('c',64),terminal,op,'starter','cus_fixture123','sub_fixture123');
 EXCEPTION WHEN OTHERS THEN error:=SQLERRM; END;
 IF error<>'recovery_terminal_subscription' THEN RAISE EXCEPTION 'canceled org not blocked: %',error;END IF;

 -- The normal rescue case: expired but still traceable and unused reference.
 x:=public.commit_paid_checkout_recovery('evt_fixture123456789',
   'cs_test_fixture123456789',repeat('a',64),org,op,'starter','cus_fixture123','sub_fixture123');
 IF x<>'reconciled' THEN RAISE EXCEPTION 'expired paid checkout not recovered'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.organizations WHERE id=org AND plan='starter'
  AND stripe_subscription_id='sub_fixture123' AND subscription_status='active'
 ) THEN RAISE EXCEPTION 'correct org not activated'; END IF;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id=other AND stripe_subscription_id IS NOT NULL) THEN
   RAISE EXCEPTION 'other tenant touched';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.billing_checkout_refs WHERE token_hash=repeat('a',64) AND used_at IS NOT NULL) THEN
  RAISE EXCEPTION 'reference was not consumed';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stripe_events WHERE id='evt_fixture123456789' AND status='processed' AND last_error IS NULL) THEN
  RAISE EXCEPTION 'incident was not closed atomically';
 END IF;
 SELECT count(*) INTO audit_count FROM private.billing_recovery_audit;
 IF audit_count<>1 THEN RAISE EXCEPTION 'audit is missing'; END IF;

 -- A simultaneous webhook writing the SAME subscription on another tenant
 -- must be stopped by the database unique index, not only by app-level checks.
 IF NOT EXISTS(SELECT 1 FROM pg_indexes
   WHERE schemaname='public' AND tablename='organizations'
     AND indexname='organizations_unique_stripe_subscription_id') THEN
   RAISE EXCEPTION 'cross-tenant unique index not deployed';
 END IF;
 error:='';
 BEGIN
   UPDATE public.organizations SET stripe_subscription_id='sub_fixture123'
   WHERE id=other;
 EXCEPTION WHEN unique_violation THEN error:='unique_violation'; END;
 IF error<>'unique_violation' THEN RAISE EXCEPTION 'DB allowed duplicate subscriptions: %',error; END IF;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id=other AND stripe_subscription_id IS NOT NULL) THEN
   RAISE EXCEPTION 'duplicate subscription update not rolled back';
 END IF;

 -- Explicit exact repetition must be idempotent (never second audit row).
 x:=public.commit_paid_checkout_recovery('evt_fixture123456789',
   'cs_test_fixture123456789',repeat('a',64),org,op,'starter','cus_fixture123','sub_fixture123');
 IF x<>'already_reconciled' OR (SELECT count(*) FROM private.billing_recovery_audit)<>1 THEN
  RAISE EXCEPTION 'retry was not idempotent';
 END IF;

 -- Replaying a different event with same subscription and consumed token blocks.
 error:='';
 BEGIN
  PERFORM public.commit_paid_checkout_recovery('evt_fixtureother12345',
   'cs_test_fixture123456789',repeat('a',64),org,op,'starter','cus_fixture123','sub_fixture123');
 EXCEPTION WHEN OTHERS THEN error:=SQLERRM; END;
 IF error<>'recovery_reference_already_used' THEN RAISE EXCEPTION 'consumed ref reused: %',error; END IF;

 -- Prevent a second tenant from taking the same existing subscription.
 error:='';
 BEGIN
  PERFORM public.commit_paid_checkout_recovery('evt_fixturesubconflict',
   'cs_test_fixture123456789',repeat('b',64),other,op,'starter','cus_fixture456','sub_fixture123');
 EXCEPTION WHEN OTHERS THEN error:=SQLERRM; END;
 IF error<>'recovery_subscription_already_associated' THEN RAISE EXCEPTION 'cross-tenant subscription not blocked: %',error;END IF;

 IF (SELECT count(*) FROM private.billing_recovery_audit)<>1 OR
 (SELECT count(*) FROM public.stripe_events WHERE status='processed')<>2 THEN
  RAISE EXCEPTION 'failed cases mutated production-like fixture';
 END IF;
 RAISE NOTICE 'PASS: authorized atomic recovery of expired paid reference, idempotency, other tenant protection and strict grants.';
END
$test$;

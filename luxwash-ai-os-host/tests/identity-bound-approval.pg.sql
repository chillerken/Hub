\set ON_ERROR_STOP on
-- Synthetic isolated PG17 fixture. No real customer records or credentials.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;

CREATE TABLE public.luxwash_app_members(user_id uuid PRIMARY KEY,role text,active boolean);
CREATE TABLE public.leads(id uuid PRIMARY KEY,consent_basis text, email text,phone text,
 opted_out boolean DEFAULT false,is_test boolean DEFAULT false, metadata jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.luxwash_ai_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid,task_type text,status text);
CREATE TABLE public.lux_ai_os_actions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 execution_mode text,status text,entity_type text,entity_id text,capability_code text,
 approved_at timestamptz,approved_by uuid,updated_at timestamptz DEFAULT now(),output jsonb);
CREATE TABLE public.sales_message_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid,status text,is_test boolean, sent_at timestamptz);

CREATE VIEW private.luxwash_warm_lead_review_v1 WITH (security_invoker=true) AS
SELECT t.id task_id,t.lead_id,l.email AS lead_name,'Synthetic Company'::text AS company,
 'carwash'::text AS service,'missing_contact_basis'::text AS review_reason,l.consent_basis contact_basis,
 0::bigint action_approval_actors,0::bigint existing_sent_since_task,
 0::bigint possible_prospecting_messages,0::bigint receipts_linked_to_exact_task,
 1::bigint actions_waiting_for_approval,true::boolean requires_human_review,
 now() - interval '1 day' task_created_at
FROM public.luxwash_ai_tasks t JOIN public.leads l ON l.id=t.lead_id;
CREATE VIEW private.luxwash_overdue_followup_review_v1
WITH (security_invoker=true) AS SELECT 'manual_followup_review'::text review_reason;

CREATE TABLE test_results (test_name text PRIMARY KEY,success boolean);
INSERT INTO public.luxwash_app_members VALUES
 ('00000000-0000-4000-8000-000000000001','owner',true),
 ('00000000-0000-4000-8000-000000000002','employee',true),
 ('00000000-0000-4000-8000-000000000003','owner',false);

INSERT INTO public.leads(id,consent_basis,email) VALUES
 ('10000000-0000-4000-8000-000000000001','legitimate_interest_b2b','test@example.test'),
 ('10000000-0000-4000-8000-000000000002','', 'nobasis@example.test'),
 ('10000000-0000-4000-8000-000000000003','legitimate_interest_b2b','optout@example.test'),
 ('10000000-0000-4000-8000-000000000004','legitimate_interest_b2b','prior@example.test');
UPDATE public.leads SET opted_out=true WHERE id='10000000-0000-4000-8000-000000000003';
INSERT INTO public.luxwash_ai_tasks(lead_id,task_type,status)
 SELECT id,'WARM_LEAD_FOLLOWUP','pending' FROM public.leads;
INSERT INTO public.lux_ai_os_actions(id,execution_mode,status,entity_type,entity_id,capability_code)
 VALUES
 ('20000000-0000-4000-8000-000000000001','approval','awaiting_approval','lead','10000000-0000-4000-8000-000000000001','personalized_messages'),
 ('20000000-0000-4000-8000-000000000002','approval','awaiting_approval','lead','10000000-0000-4000-8000-000000000002','personalized_messages'),
 ('20000000-0000-4000-8000-000000000003','approval','awaiting_approval','lead','10000000-0000-4000-8000-000000000003','personalized_messages'),
 ('20000000-0000-4000-8000-000000000004','approval','awaiting_approval','lead','10000000-0000-4000-8000-000000000004','personalized_messages');
INSERT INTO public.sales_message_drafts(lead_id,status,is_test,sent_at)
 VALUES('10000000-0000-4000-8000-000000000004','sent',false,now()-interval '1 day');

\ir ../migrations/20261010_ai_action_approval_proof_trigger.sql
\ir ../migrations/20261010_identity_bound_approval_v1.sql

-- Public RPC INVOKER + only authenticated execute.
DO $$
BEGIN
 IF has_function_privilege('anon','public.luxwash_identity_review_decide_v1(uuid,text)','EXECUTE')
    OR has_function_privilege('service_role','public.luxwash_identity_review_decide_v1(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.luxwash_identity_review_decide_v1(uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Invalid public approval RPC ACL';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.luxwash_identity_review_decide_v1(uuid,text)'::regprocedure AND prosecdef) THEN
   RAISE EXCEPTION 'Exposed public approval RPC must be invoker';
 END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false}',false);
DO $$
DECLARE v jsonb; failed boolean;
BEGIN
  v := public.luxwash_identity_review_queue_v1();
  IF jsonb_array_length(v->'warm_leads')<>4 OR (v->>'external_dispatch_enabled') <> 'false' THEN
    RAISE EXCEPTION 'Authorized queue failed';
  END IF;
  -- Missing legal contact basis: block.
  failed:=false;
  BEGIN PERFORM public.luxwash_identity_review_decide_v1('20000000-0000-4000-8000-000000000002','approve');
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Missing basis not blocked'; END IF;
  failed:=false;
  BEGIN PERFORM public.luxwash_identity_review_decide_v1('20000000-0000-4000-8000-000000000003','approve');
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Opt-out not blocked'; END IF;
  failed:=false;
  BEGIN PERFORM public.luxwash_identity_review_decide_v1('20000000-0000-4000-8000-000000000004','approve');
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Recent prior send not blocked'; END IF;

  -- Real approval records ACTOR but never dispatches message or completes task.
  v:=public.luxwash_identity_review_decide_v1('20000000-0000-4000-8000-000000000001','approve');
  IF (v->>'action_status')<>'approved' OR v->>'external_dispatch'<>'false' THEN
    RAISE EXCEPTION 'Approval state incorrect';
  END IF;
  IF (SELECT approved_by FROM public.lux_ai_os_actions WHERE id='20000000-0000-4000-8000-000000000001')
    <> '00000000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Actor was not bound to JWT identity';
  END IF;
  IF (SELECT count(*) FROM public.luxwash_ai_tasks WHERE status='pending')<>4 OR
     (SELECT count(*) FROM public.sales_message_drafts)<>1 THEN
    RAISE EXCEPTION 'Unexpected provider-side effect';
  END IF;
  failed:=false;
  BEGIN PERFORM public.luxwash_identity_review_decide_v1('20000000-0000-4000-8000-000000000001','approve');
  EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Replay allowed'; END IF;
  v:=public.luxwash_identity_review_decide_v1('20000000-0000-4000-8000-000000000002','reject');
  IF (v->>'action_status')<>'rejected' THEN RAISE EXCEPTION 'Rejection failed'; END IF;
END $$;

-- Role-based denial. The caller cannot submit someone else's identity.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$
DECLARE failed boolean:=false;
BEGIN
 BEGIN PERFORM public.luxwash_identity_review_queue_v1();
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Employee had owner review access'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
DO $$
DECLARE failed boolean:=false;
BEGIN
 BEGIN PERFORM public.luxwash_identity_review_queue_v1();
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Inactive owner had review access'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":true}',false);
DO $$
DECLARE failed boolean:=false;
BEGIN
 BEGIN PERFORM public.luxwash_identity_review_queue_v1();
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Anonymous auth identity allowed'; END IF;
END $$;
RESET ROLE;
SELECT count(*) AS synthetic_approvals FROM public.lux_ai_os_actions WHERE approved_by IS NOT NULL;

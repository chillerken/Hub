\set ON_ERROR_STOP on
-- Fake records only, disposable Postgres service. No live lead IDs or providers.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;

CREATE TABLE public.leads (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 company text NOT NULL DEFAULT '',
 service text NOT NULL DEFAULT '',
 source text NOT NULL DEFAULT '',
 opted_out boolean NOT NULL DEFAULT false,
 is_test boolean NOT NULL DEFAULT false,
 consent_basis text NOT NULL DEFAULT '',
 email text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT ''
);
CREATE TABLE public.luxwash_ai_tasks (
 id uuid PRIMARY KEY, lead_id uuid, task_type text NOT NULL,
 status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 scheduled_for timestamptz
);
CREATE TABLE public.lux_ai_os_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id text,
 entity_type text, capability_code text, status text,
 approved_at timestamptz, approved_by uuid
);
CREATE TABLE public.sales_message_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid, status text, is_test boolean NOT NULL DEFAULT false,
 provider_id text, sent_at timestamptz, generated_by text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 status text NOT NULL, customer_id uuid,
 appointment_id uuid, phone_call_id uuid,
 summary text NOT NULL, priority text NOT NULL,
 due_at timestamptz NOT NULL, dedupe_key text
);
GRANT SELECT ON public.leads, public.luxwash_ai_tasks, public.lux_ai_os_actions,
  public.sales_message_drafts, public.followups TO service_role;

INSERT INTO public.leads(id,name,company,consent_basis,opted_out,email) VALUES
('00000000-0000-4000-8000-000000000001','Synthetic A','Test Ltd','legitimate_interest_b2b',true,'a@example.test'),
('00000000-0000-4000-8000-000000000002','Synthetic B','Test Ltd','',false,'b@example.test'),
('00000000-0000-4000-8000-000000000003','Synthetic C','Test Ltd','legitimate_interest_b2b',false,'c@example.test'),
('00000000-0000-4000-8000-000000000004','Synthetic D','Test Ltd','legitimate_interest_b2b',false,'d@example.test');

INSERT INTO public.luxwash_ai_tasks(id,lead_id,task_type,status,created_at) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','WARM_LEAD_FOLLOWUP','pending',now()-interval '2 day'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','WARM_LEAD_FOLLOWUP','pending',now()-interval '2 day'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','WARM_LEAD_FOLLOWUP','pending',now()-interval '2 day'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','WARM_LEAD_FOLLOWUP','pending',now()-interval '2 day');

INSERT INTO public.lux_ai_os_actions(entity_type,entity_id,capability_code,status,approved_at,approved_by)
VALUES ('lead','00000000-0000-4000-8000-000000000003','personalized_messages','completed',now()-interval '1 day',null),
('lead','00000000-0000-4000-8000-000000000004','personalized_messages','completed',now()-interval '1 day','20000000-0000-4000-8000-000000000001');

INSERT INTO public.sales_message_drafts(lead_id,status,is_test,provider_id,sent_at,generated_by,metadata)
VALUES ('00000000-0000-4000-8000-000000000003','sent',false,'fake-provider-001',now()-interval '1 day','luxscout','{}'),
('00000000-0000-4000-8000-000000000004','sent',false,'fake-provider-002',now()-interval '1 day','approved_human','{"task_id":"10000000-0000-4000-8000-000000000004"}');

INSERT INTO public.followups(status,customer_id,summary,priority,due_at,dedupe_key) VALUES
('open',null,'synthetic review needed','normal',now()-interval '1 day',null),
('open','20000000-0000-4000-8000-000000000002','synthetic approved case','normal',now()-interval '1 day','fake-002'),
('open','20000000-0000-4000-8000-000000000003','not due','normal',now()+interval '1 day','fake-003');

\ir ../migrations/20261010_warm_lead_review_views.sql

DO $$
DECLARE
 v_count int;
BEGIN
 IF has_table_privilege('anon','private.luxwash_warm_lead_review_v1','SELECT') OR
    has_table_privilege('authenticated','private.luxwash_warm_lead_review_v1','SELECT') OR
    has_table_privilege('anon','private.luxwash_overdue_followup_review_v1','SELECT') OR
    has_table_privilege('authenticated','private.luxwash_overdue_followup_review_v1','SELECT') THEN
    RAISE EXCEPTION 'Review view exposed to public roles';
 END IF;
 IF (SELECT count(*) FROM private.luxwash_warm_lead_review_v1) <> 4 THEN
   RAISE EXCEPTION 'Expected exactly 4 synthetic warm leads';
 END IF;
 IF (SELECT review_reason FROM private.luxwash_warm_lead_review_v1 WHERE lead_name='Synthetic A')<>'opted_out_no_dispatch' THEN
   RAISE EXCEPTION 'Opt-out review classification failed';
 END IF;
 IF (SELECT review_reason FROM private.luxwash_warm_lead_review_v1 WHERE lead_name='Synthetic B')<>'missing_contact_basis' THEN
   RAISE EXCEPTION 'Missing-contact-basis classification failed';
 END IF;
 IF (SELECT review_reason FROM private.luxwash_warm_lead_review_v1 WHERE lead_name='Synthetic C')<>'approval_actor_not_recorded' THEN
   RAISE EXCEPTION 'Missing approval actor was ignored';
 END IF;
 IF (SELECT possible_prospecting_messages FROM private.luxwash_warm_lead_review_v1 WHERE lead_name='Synthetic C') <> 1 THEN
   RAISE EXCEPTION 'Prior prospecting receipt not flagged';
 END IF;
 IF (SELECT receipts_linked_to_exact_task FROM private.luxwash_warm_lead_review_v1 WHERE lead_name='Synthetic D') <> 1 THEN
   RAISE EXCEPTION 'Exact task receipt not associated';
 END IF;
 IF (SELECT review_reason FROM private.luxwash_warm_lead_review_v1 WHERE lead_name='Synthetic D') <> 'manual_dispatch_review' THEN
   RAISE EXCEPTION 'Human review must remain mandatory';
 END IF;
 IF (SELECT count(*) FROM private.luxwash_overdue_followup_review_v1) <> 2 THEN
   RAISE EXCEPTION 'Future followup must be excluded';
 END IF;
 IF (SELECT count(*) FROM private.luxwash_overdue_followup_review_v1 WHERE review_reason='unlinked_customer_requires_review') <> 1 THEN
   RAISE EXCEPTION 'Unlinked overdue followup not flagged';
 END IF;
 RAISE NOTICE 'PASS: private review queue, opt-out, consent, approval, prior-send and exact-task receipt tests';
END $$;

SET ROLE service_role;
SELECT count(*) AS warm_rows_service_role FROM private.luxwash_warm_lead_review_v1;
SELECT count(*) AS followups_service_role FROM private.luxwash_overdue_followup_review_v1;
RESET ROLE;

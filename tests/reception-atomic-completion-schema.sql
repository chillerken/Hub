-- Synthetic schema only. The runner refuses non-loopback databases.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.memberships(organization_id uuid,user_id uuid,role text,active boolean);
CREATE TABLE public.leads(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.appointments(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,lead_id uuid NOT NULL REFERENCES public.leads(id),
 status text NOT NULL,start_at timestamptz,end_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE TABLE public.customer_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,
 lead_id uuid NOT NULL REFERENCES public.leads(id),appointment_id uuid REFERENCES public.appointments(id),
 status text NOT NULL,amount_cents int,currency text DEFAULT 'EUR',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.audit_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid NOT NULL,
 actor_user_id uuid,event_type text NOT NULL,entity_type text,entity_id uuid,payload jsonb);
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.memberships,public.customer_payments TO service_role;
GRANT SELECT,UPDATE ON public.appointments,public.leads TO service_role;
GRANT INSERT ON public.audit_events TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

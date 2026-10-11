-- NOT APPROVED FOR DEPLOYMENT. Inert source code until explicitly released.
-- This is the database commit phase ONLY. A future platform-operator endpoint must
-- first verify CURRENT Stripe session/event/subscription via authenticated Stripe GET.
-- No raw checkout reference, email, secret, refund or charge is stored here.
CREATE TABLE IF NOT EXISTS private.billing_recovery_audit (
  stripe_event_id text PRIMARY KEY,
  stripe_session_id text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_user_id uuid NOT NULL,
  subscription_id text NOT NULL,
  plan text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.billing_recovery_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.billing_recovery_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE private.billing_recovery_audit TO service_role;

-- This function may be called ONLY by the server's service role, AFTER
-- authenticated Stripe proof and separate, explicit operator confirmation.
-- It atomically locks the reference, organization and event in webhook order.
CREATE OR REPLACE FUNCTION public.commit_paid_checkout_recovery(
  p_event_id text,
  p_session_id text,
  p_token_hash text,
  p_organization_id uuid,
  p_operator_user_id uuid,
  p_plan text,
  p_customer_id text,
  p_subscription_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 r private.billing_checkout_refs%rowtype;
 o public.organizations%rowtype;
 e public.stripe_events%rowtype;
 original public.organizations%rowtype;
 rec private.billing_recovery_audit%rowtype;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.memberships m
   JOIN public.organizations staff ON staff.id=m.organization_id
   WHERE m.user_id=p_operator_user_id
     AND m.active=true
     AND m.role IN ('owner','admin')
     AND staff.is_internal=true
 ) THEN
   RAISE EXCEPTION 'recovery_operator_not_authorized';
 END IF;
 IF p_organization_id IS NULL
    OR p_event_id !~ '^evt_[A-Za-z0-9]{10,128}$'
    OR p_session_id !~ '^cs_(live|test)_[A-Za-z0-9]{10,200}$'
    OR p_token_hash !~ '^[a-f0-9]{64}$'
    OR p_plan NOT IN ('starter','pro','business')
    OR p_customer_id !~ '^cus_[A-Za-z0-9]{5,128}$'
    OR p_subscription_id !~ '^sub_[A-Za-z0-9]{5,128}$' THEN
   RAISE EXCEPTION 'invalid_paid_checkout_recovery_input';
 END IF;

 SELECT * INTO r FROM private.billing_checkout_refs
  WHERE token_hash=p_token_hash AND plan=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'recovery_reference_not_found'; END IF;
 IF r.organization_id<>p_organization_id THEN
   RAISE EXCEPTION 'recovery_reference_organization_mismatch';
 END IF;

 SELECT * INTO o FROM public.organizations
  WHERE id=p_organization_id FOR UPDATE;
 IF NOT FOUND OR o.is_internal OR o.status='suspended' THEN
   RAISE EXCEPTION 'recovery_organization_unavailable';
 END IF;
 IF o.plan NOT IN ('trial',p_plan) THEN
   RAISE EXCEPTION 'recovery_plan_conflict';
 END IF;
 IF o.stripe_customer_id IS NOT NULL AND o.stripe_customer_id<>p_customer_id THEN
   RAISE EXCEPTION 'recovery_customer_conflict';
 END IF;
 IF o.stripe_subscription_id IS NOT NULL AND o.stripe_subscription_id<>p_subscription_id THEN
   RAISE EXCEPTION 'recovery_subscription_conflict';
 END IF;
 IF o.subscription_status IN ('canceled','unpaid','incomplete_expired') THEN
   RAISE EXCEPTION 'recovery_terminal_subscription';
 END IF;

 -- Strong protection against cross-tenant association.
 IF EXISTS(SELECT 1 FROM public.organizations x
           WHERE x.id<>p_organization_id
           AND x.stripe_subscription_id=p_subscription_id) THEN
   RAISE EXCEPTION 'recovery_subscription_already_associated';
 END IF;

 SELECT * INTO e FROM public.stripe_events
  WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND OR
    e.event_type NOT IN ('checkout.session.completed','checkout.session.async_payment_succeeded') THEN
   RAISE EXCEPTION 'recovery_event_not_found';
 END IF;
 IF e.status='processed' THEN
   SELECT * INTO rec FROM private.billing_recovery_audit
     WHERE stripe_event_id=p_event_id;
   IF FOUND AND rec.stripe_session_id=p_session_id
      AND rec.organization_id=p_organization_id
      AND rec.actor_user_id=p_operator_user_id
      AND rec.subscription_id=p_subscription_id AND rec.plan=p_plan
      AND o.plan=p_plan AND o.subscription_status='active'
      AND o.stripe_customer_id=p_customer_id AND o.stripe_subscription_id=p_subscription_id THEN
     RETURN 'already_reconciled';
   END IF;
   RAISE EXCEPTION 'recovery_event_already_processed';
 END IF;
 IF e.status<>'failed' OR
    e.last_error IS NULL OR
    e.last_error NOT LIKE 'paid_checkout_unlinked:%' THEN
   RAISE EXCEPTION 'recovery_event_not_in_expected_state';
 END IF;

 IF r.used_at IS NOT NULL THEN
   RAISE EXCEPTION 'recovery_reference_already_used';
 END IF;

 -- This function deliberately permits an EXPIRED, not-yet-used reference.
 -- The separate API must freshly verify the live Stripe payment and subscription.
 UPDATE public.organizations
   SET plan=p_plan,subscription_status='active',
       stripe_customer_id=p_customer_id,stripe_subscription_id=p_subscription_id,
       updated_at=now()
 WHERE id=p_organization_id;

 UPDATE private.billing_checkout_refs
   SET used_at=now()
 WHERE token_hash=p_token_hash AND used_at IS NULL;

 UPDATE public.stripe_events
   SET status='processed',processed_at=now(),
       last_error=NULL,updated_at=now()
 WHERE id=p_event_id AND status='failed';

 INSERT INTO private.billing_recovery_audit(
   stripe_event_id,stripe_session_id,organization_id,actor_user_id,
   subscription_id,plan
 ) VALUES(
   p_event_id,p_session_id,p_organization_id,p_operator_user_id,
   p_subscription_id,p_plan
 );

 RETURN 'reconciled';
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_paid_checkout_recovery(
 text,text,text,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_paid_checkout_recovery(
 text,text,text,uuid,uuid,text,text,text) TO service_role;

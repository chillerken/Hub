// Trusted-provider orchestration for read-only Reception AI Stripe incident review.
// Never performs customer/Stripe/database mutations. All provider calls are reads.
// A result is evidence for a human operator, NEVER an activation authorization.
import { assessPaidCheckout, sha256Reference } from "./reconciliation-assessment.js";

const r=(httpStatus,code,assessment=null)=>Object.freeze({httpStatus,body:Object.freeze({
  ok:httpStatus===200,code,...(assessment?{assessment}:{}),can_auto_activate:false
})});

const id=(v,pattern)=>typeof v==="string"&&pattern.test(v);
const EVENT=/^evt_[a-zA-Z0-9]{10,128}$/;
const SESSION=/^cs_(?:live|test)_[a-zA-Z0-9]{10,200}$/;
const SUB=/^sub_[a-zA-Z0-9]{5,128}$/;
const INCIDENT_TYPES=new Set(["checkout.session.completed","checkout.session.async_payment_succeeded"]);
const ACTIVE_SUBS=new Set(["active","trialing"]);

export async function reviewPaidCheckoutEvidence(input,providers){
  // Fail closed if user, environment or restricted incident context is unknown.
  if(!input||!id(input.event_id,EVENT)||!id(input.session_id,SESSION))
    return r(400,"invalid_incident_identifiers");
  if(typeof input.expectedLivemode!=="boolean")
    return r(503,"environment_not_configured");
  if(input.session_id.startsWith("cs_live_")!==input.expectedLivemode)
    return r(409,"stripe_environment_mismatch");

  const incident=await providers.getIncident(input.event_id);
  if(!incident||incident.status!=="failed"||
      typeof incident.last_error!=="string"||
      !incident.last_error.startsWith("paid_checkout_unlinked:"))
    return r(404,"unresolved_paid_checkout_incident_not_found");

  // Two independent Stripe reads prove event-to-session provenance and payment status.
  const [event,session]=await Promise.all([
    providers.getStripeEvent(input.event_id),
    providers.getStripeSession(input.session_id)
  ]);
  if(!event||!session||event.id!==input.event_id||session.id!==input.session_id||
     !INCIDENT_TYPES.has(event.type)||event.data?.object?.id!==session.id||
     event.livemode!==input.expectedLivemode||session.livemode!==input.expectedLivemode)
    return r(409,"stripe_event_session_mismatch");

  const app=String(session.metadata?.app||"").toLowerCase();
  const plan=String(session.metadata?.plan||"").toLowerCase();
  if(!["reception_ai","mijn_ai_business"].includes(app)||
      !["starter","pro","business"].includes(plan))
    return r(409,"untrusted_reception_ai_plan");

  // Fetch active commercial catalog from the server's privileged read connection.
  const catalog=await providers.getCatalog(plan);
  // Never issue a DB lookup for untrusted raw client_reference_id.
  const digest=await sha256Reference(session.client_reference_id);
  const reference=digest?await providers.getReference(digest):null;
  const org=reference?.organization_id
    ?await providers.getOrganization(reference.organization_id):null;
  const assessment=await assessPaidCheckout({
    session,catalog,reference,organization:org,
    expectedLivemode:input.expectedLivemode,nowMs:input.nowMs
  });

  // A paid historical Checkout is insufficient to re-activate a canceled subscription.
  if(SUB.test(String(session.subscription||""))&&
      ["ready_for_authorized_replay","needs_operator_reconciliation"].includes(assessment.status)){
    const subscription=await providers.getStripeSubscription(session.subscription);
    if(!subscription||subscription.id!==session.subscription||
       subscription.customer!==session.customer||
       subscription.livemode!==input.expectedLivemode||
       !ACTIVE_SUBS.has(subscription.status))
      return r(200,"review_completed",{
        status:"blocked",reason:"stripe_subscription_not_current",
        can_auto_activate:false,needs_operator_approval:true
      });
  }
  // No PII, Stripe customer IDs, subscription IDs, raw tokens or provider payloads.
  return r(200,"review_completed",assessment);
}

// Final, explicit operator approval gate for an expired but PROVABLE paid Checkout.
// Invoked only by an authenticated, internal-platform operator endpoint.
// This module does no Stripe or database calls itself; all provider dependencies
// must retrieve authoritative data server-side, never browser-supplied objects.
import { reviewPaidCheckoutEvidence } from "./review-core.js";
import { sha256Reference } from "./reconciliation-assessment.js";

const ORG=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUB=/^sub_[A-Za-z0-9]{5,128}$/;
const ack="I_APPROVE_PAID_CHECKOUT_RECOVERY";
const no=(httpStatus,reason)=>({
 httpStatus,body:{ok:false,reason,can_auto_activate:false}
});
export async function commitOperatorApprovedRecovery(input,providers){
 if(!input||input.confirm!==ack || !ORG.test(String(input.expected_organization_id||"")))
   return no(400,"explicit_operator_confirmation_required");
 if(!ORG.test(String(input.operator_user_id||"")))
   return no(403,"verified_operator_required");
 if(typeof input.expectedLivemode!=="boolean"||!Number.isFinite(input.nowMs))
   return no(503,"server_environment_not_configured");

 let verifiedSession=null,verifiedReference=null,verifiedOrganization=null;
 const reads={
  ...providers,
  getStripeSession:async id=>(verifiedSession=await providers.getStripeSession(id)),
  getReference:async digest=>(verifiedReference=await providers.getReference(digest)),
  getOrganization:async id=>(verifiedOrganization=await providers.getOrganization(id))
 };
 const assessed=await reviewPaidCheckoutEvidence({
  event_id:input.event_id,session_id:input.session_id,
  expectedLivemode:input.expectedLivemode,nowMs:input.nowMs
 },reads);
 if(assessed.httpStatus!==200)return no(assessed.httpStatus,assessed.body.code);
 if(assessed.body.assessment?.reason!=="expired_verified_reference")
   return no(409,"not_an_approved_expired_reference_case");

 if(!verifiedReference||verifiedReference.used_at
   ||verifiedReference.organization_id!==input.expected_organization_id
   ||verifiedOrganization?.id!==input.expected_organization_id
   ||verifiedOrganization.is_internal===true)
   return no(409,"original_tenant_authorization_missing");

 const session=verifiedSession;
 const hash=await sha256Reference(session?.client_reference_id);
 if(!hash||hash!==verifiedReference.token_hash)return no(409,"source_reference_mismatch");
 if(!SUB.test(String(session?.subscription||"")))
   return no(409,"missing_subscription_id");
 // Fresh Stripe read immediately before invoking the atomic DB transaction.
 const subscription=await providers.getStripeSubscription(session.subscription);
 if(!subscription||subscription.id!==session.subscription
    ||subscription.livemode!==input.expectedLivemode
    ||subscription.customer!==session.customer
    ||subscription.status!=="active")
   return no(409,"subscription_not_active_at_commit");

 // The SQL must independently enforce operator membership, exact original
 // organization, failed incident, subscription uniqueness and unique audit.
 const result=await providers.commit({
  p_event_id:input.event_id,
  p_session_id:input.session_id,
  p_token_hash:hash,
  p_organization_id:input.expected_organization_id,
  p_operator_user_id:input.operator_user_id,
  p_plan:String(session.metadata.plan).toLowerCase(),
  p_customer_id:session.customer,
  p_subscription_id:session.subscription
 });
 if(result!=="reconciled" && result!=="already_reconciled")
   return no(409,"atomic_recovery_not_confirmed");
 return {
  httpStatus:200,
  body:{ok:true,result,can_auto_activate:false}
 };
}

import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {reviewPaidCheckoutEvidence} from "../ai-receptionist-host/supabase/functions/billing-reconciliation-review/review-core.js";
import {readFileSync} from "node:fs";

const NOW = Date.UTC(2026,9,11,3,0);
const ref="a1".repeat(32);
const digest=createHash("sha256").update(ref).digest("hex");
const eventId="evt_fixture123456789";
const sessionId="cs_test_fixture123456789";
const session={
 id:sessionId,livemode:false,mode:"subscription",status:"complete",payment_status:"paid",
 metadata:{app:"reception_ai",plan:"starter"},
 payment_link:"plink_fixture123",customer:"cus_fixture123",
 subscription:"sub_fixture123",client_reference_id:ref
};
const event={id:eventId,livemode:false,type:"checkout.session.completed",data:{object:{id:sessionId}}};
const incident={id:eventId,status:"failed",last_error:"paid_checkout_unlinked: paid session"};
const reference={token_hash:digest,organization_id:"org_fixture",plan:"starter",expires_at:new Date(NOW+3600000).toISOString(),used_at:null};
const org={id:"org_fixture",is_internal:false,stripe_customer_id:null,stripe_subscription_id:null,subscription_status:"trialing"};
const catalog={active:true,plan:"starter",stripe_payment_link_id:"plink_fixture123"};
const subscription={id:"sub_fixture123",livemode:false,customer:"cus_fixture123",status:"active"};
function fixture({incident:i=incident,event:e=event,session:s=session,reference:r=reference,
 organization:o=org,catalog:c=catalog,subscription:u=subscription}={}){
 const calls=[];
 const p={
  getIncident:async x=>{calls.push("incident");return i;},
  getStripeEvent:async x=>{calls.push("stripeEvent");return e;},
  getStripeSession:async x=>{calls.push("stripeSession");return s;},
  getStripeSubscription:async x=>{calls.push("stripeSubscription");return u;},
  getCatalog:async x=>{calls.push("catalog");return c;},
  getReference:async x=>{calls.push("reference");assert.equal(x,digest);return r;},
  getOrganization:async x=>{calls.push("organization");return o;}
 };
 const run=(override={})=>reviewPaidCheckoutEvidence({
  event_id:eventId,session_id:sessionId,expectedLivemode:false,nowMs:NOW,...override
 },p);
 return{run,calls};
}

test("safe matching payment returns manual replay candidate, never activation",async()=>{
 const f=fixture(),out=await f.run();
 assert.equal(out.httpStatus,200);
 assert.equal(out.body.assessment.status,"ready_for_authorized_replay");
 assert.equal(out.body.assessment.reason,"matching_paid_checkout_and_valid_reference");
 assert.equal(out.body.can_auto_activate,false);
 assert.equal(out.body.assessment.can_auto_activate,false);
 assert.ok(f.calls.includes("stripeSubscription"));
 for(const secret of [ref,digest,"cus_fixture123","sub_fixture123"]){
  assert.equal(JSON.stringify(out).includes(secret),false);
 }
});

test("rejects invalid event/session identifiers before reading providers",async()=>{
 const f=fixture();
 const v=await f.run({event_id:"evt_bad"});
 assert.equal(v.httpStatus,400);assert.equal(f.calls.length,0);
 const v2=await f.run({session_id:"x"});
 assert.equal(v2.httpStatus,400);assert.equal(f.calls.length,0);
});
test("event must already be a FAILED paid but unlinked incident",async()=>{
 for(const i of [null,{...incident,status:"processed"},{...incident,last_error:"other failure"}]){
  const f=fixture({incident:i});const v=await f.run();
  assert.equal(v.httpStatus,404);assert.deepEqual(f.calls,["incident"]);
 }
});
test("livemode mismatch rejected before remote lookup",async()=>{
 const f=fixture();const v=await f.run({expectedLivemode:true});
 assert.equal(v.httpStatus,409);assert.equal(f.calls.length,0);
});
test("Stripe event must match retrieved Checkout Session",async()=>{
 for(const bad of [
  {...event,data:{object:{id:"cs_test_wrong"}}},
  {...event,livemode:true},
  {...event,type:"invoice.paid"},
  {...event,id:"evt_other"}
 ]){
  const f=fixture({event:bad});const v=await f.run();
  assert.equal(v.httpStatus,409);assert.equal(v.body.code,"stripe_event_session_mismatch");
 }
});
test("unpaid or expired Stripe Checkout is blocked",async()=>{
 for(const patch of [{payment_status:"unpaid"},{status:"expired"},{mode:"payment"}]){
  const f=fixture({session:{...session,...patch}});
  const v=await f.run();assert.equal(v.body.assessment.status,"blocked");
 }
});
test("untrusted app and plan blocked without reading refs",async()=>{
 for(const metadata of [{app:"other",plan:"starter"},{app:"reception_ai",plan:"custom"}]){
  const f=fixture({session:{...session,metadata}});
  const v=await f.run();assert.equal(v.httpStatus,409);
  assert.equal(f.calls.includes("reference"),false);
 }
});
test("invalid catalog link produces blocked verdict",async()=>{
 const f=fixture({catalog:{...catalog,stripe_payment_link_id:"plink_other"}});
 const v=await f.run();assert.equal(v.body.assessment.reason,"untrusted_payment_link_or_plan");
});
test("expired reference requires operator reconciliation but never auto activate",async()=>{
 const f=fixture({reference:{...reference,expires_at:new Date(NOW-1).toISOString()}});
 const v=await f.run();assert.equal(v.body.assessment.status,"needs_operator_reconciliation");
 assert.equal(v.body.assessment.reason,"expired_verified_reference");
 assert.equal(v.body.can_auto_activate,false);
});
test("missing reference is not assumed from email or Stripe customer ID",async()=>{
 const f=fixture({reference:null});const v=await f.run();
 assert.equal(v.body.assessment.status,"needs_operator_reconciliation");
});
test("conflicting organization subscription blocked",async()=>{
 const f=fixture({organization:{...org,stripe_subscription_id:"sub_other"}});
 const v=await f.run();assert.equal(v.body.assessment.reason,"existing_subscription_conflict");
});
test("used reference cannot be reused for another activation",async()=>{
 const f=fixture({reference:{...reference,used_at:new Date(NOW-100).toISOString()}});
 const v=await f.run();assert.equal(v.body.assessment.status,"blocked");
});
test("matching already-active subscription remains read-only",async()=>{
 const f=fixture({reference:{...reference,used_at:new Date(NOW-100).toISOString()},
   organization:{...org,stripe_customer_id:"cus_fixture123",stripe_subscription_id:"sub_fixture123",subscription_status:"active"}});
 const v=await f.run();assert.equal(v.body.assessment.status,"already_active");
 assert.equal(v.body.can_auto_activate,false);
});
test("historical paid checkout with canceled subscription is blocked",async()=>{
 const f=fixture({subscription:{...subscription,status:"canceled"}});
 const v=await f.run();assert.equal(v.body.assessment.reason,"stripe_subscription_not_current");
 assert.equal(v.body.can_auto_activate,false);
});
test("subscription from another Stripe customer or environment is blocked",async()=>{
 for(const patch of [{customer:"cus_other"},{livemode:true},{id:"sub_other"}]){
  const f=fixture({subscription:{...subscription,...patch}});
  const v=await f.run();assert.equal(v.body.assessment.reason,"stripe_subscription_not_current");
 }
});
test("no provider includes write capability or mutation",async()=>{
 const core=readFileSync("ai-receptionist-host/supabase/functions/billing-reconciliation-review/review-core.js","utf8");
 const endpoint=readFileSync("ai-receptionist-host/supabase/functions/billing-reconciliation-review/index.ts","utf8");
 assert.doesNotMatch(core,/\b(?:insert|update|delete|upsert|postPayment|refund|resend)\s*\(/i);
 assert.doesNotMatch(endpoint,/db\.from\([^\n]*\)\.(?:insert|update|delete|upsert)\s*\(/i);
 assert.match(endpoint,/BILLING_REVIEW_ENABLED/);
 assert.match(endpoint,/getUser\(/);
 assert.match(endpoint,/is_internal",true/);
 assert.doesNotMatch(endpoint,/\"Access-Control-Allow-Origin\":\"\*\"/);
});
test("bundled assessor source exactly matches reviewed PR #34 helper",async()=>{
 const live=readFileSync("ai-receptionist-host/supabase/functions/stripe-webhook/reconciliation-assessment.js","utf8");
 const bundled=readFileSync("ai-receptionist-host/supabase/functions/billing-reconciliation-review/reconciliation-assessment.js","utf8");
 const marker="// Keep in sync; verified by CI source-equivalence test.\n";
 assert.equal(bundled.split(marker)[1],live);
});

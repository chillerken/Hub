import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assessPaidCheckout, sha256Reference } from "../ai-receptionist-host/supabase/functions/stripe-webhook/reconciliation-assessment.js";

const NOW = Date.UTC(2026, 9, 11, 3, 0);
const token = "a1".repeat(32);
const token_hash = createHash("sha256").update(token).digest("hex");
const catalog = { plan:"starter", active:true, stripe_payment_link_id:"plink_fixture_starter" };
const session = {
  id:"cs_test_fixture", livemode:false, mode:"subscription",
  status:"complete", payment_status:"paid",
  metadata:{ app:"reception_ai", plan:"starter" },
  payment_link:"plink_fixture_starter",
  customer:"cus_fixture", subscription:"sub_fixture", client_reference_id:token
};
const reference = { token_hash, organization_id:"org_fixture", plan:"starter", used_at:null, expires_at:new Date(NOW+3600000).toISOString() };
const organization = { id:"org_fixture", is_internal:false, stripe_customer_id:null, stripe_subscription_id:null, subscription_status:"trialing" };

const assess = overrides => assessPaidCheckout({
  session:{...session,...(overrides?.session||{})},
  catalog:{...catalog,...(overrides?.catalog||{})},
  reference:overrides?.reference===null?null:{...reference,...(overrides?.reference||{})},
  organization:overrides?.organization===null?null:{...organization,...(overrides?.organization||{})},
  expectedLivemode:overrides?.expectedLivemode ?? false,
  nowMs:NOW
});

test("paid and provably linked checkout may be replayed by approved operator only",async()=>{
  const v=await assess();
  assert.equal(v.status,"ready_for_authorized_replay");
  assert.equal(v.reason,"matching_paid_checkout_and_valid_reference");
  assert.equal(v.can_auto_activate,false);
  assert.equal(v.needs_operator_approval,true);
  assert.equal(JSON.stringify(v).includes(token),false,"no raw reference disclosed");
});

test("expired but verified reference needs explicit reconciliation; not automatic activation",async()=>{
  const v=await assess({reference:{expires_at:new Date(NOW-1).toISOString()}});
  assert.deepEqual([v.status,v.reason,v.can_auto_activate],["needs_operator_reconciliation","expired_verified_reference",false]);
});

test("no found reference is never treated as tenant authorization",async()=>{
  const missing=await assess({reference:null});
  assert.equal(missing.status,"needs_operator_reconciliation");
  assert.equal(missing.reason,"reference_not_found_or_mismatched");
});

test("legacy UUID and raw missing reference cannot authorize recovery",async()=>{
  assert.equal(await sha256Reference("invalid"),null);
  for(const ref of ["00000000-0000-4000-8000-000000000001",""]){
    const v=await assess({session:{client_reference_id:ref}});
    assert.equal(v.status,"needs_operator_reconciliation");
  }
});

test("wrong Stripe account environment is blocked",async()=>{
  const v=await assess({session:{livemode:true}});
  assert.deepEqual([v.status,v.reason],["blocked","stripe_environment_mismatch"]);
});

test("unpaid or incomplete checkout cannot count as paid",async()=>{
  for(const properties of [
    {payment_status:"unpaid"},{status:"expired"},{status:"open"},{mode:"payment"}
  ]){
    const v=await assess({session:properties});
    assert.equal(v.status,"blocked");
    assert.equal(v.reason,"no_completed_paid_subscription_checkout");
  }
});

test("unknown app and wrong plan cannot be assigned",async()=>{
  for(const metadata of [{app:"unrelated",plan:"starter"},{app:"reception_ai",plan:"unlisted"}]){
    assert.equal((await assess({session:{metadata}})).reason,"unrecognized_app_or_plan");
  }
});

test("forged payment-link or catalog mismatch blocks tenant reassignment",async()=>{
  assert.equal((await assess({session:{payment_link:"plink_fixture_other"}})).reason,"untrusted_payment_link_or_plan");
  assert.equal((await assess({catalog:{active:false}})).status,"blocked");
  assert.equal((await assess({catalog:{plan:"pro"}})).status,"blocked");
});

test("subscription and customer identifiers must be present",async()=>{
  assert.equal((await assess({session:{subscription:null}})).reason,"missing_stripe_customer_or_subscription");
  assert.equal((await assess({session:{customer:null}})).reason,"missing_stripe_customer_or_subscription");
});

test("client reference hash must match authorized database record",async()=>{
  const v=await assess({reference:{token_hash:createHash("sha256").update("b2".repeat(32)).digest("hex")}});
  assert.equal(v.reason,"reference_not_found_or_mismatched");
  assert.equal(v.can_auto_activate,false);
});

test("reference plan, organization and internal account controls are enforced",async()=>{
  assert.equal((await assess({reference:{plan:"pro"}})).reason,"reference_plan_mismatch");
  assert.equal((await assess({reference:{organization_id:"org_other"}})).reason,"untrusted_or_internal_organization");
  assert.equal((await assess({organization:{is_internal:true}})).reason,"untrusted_or_internal_organization");
});

test("existing subscription/customer conflicts block cross-tenant changes",async()=>{
  assert.equal((await assess({organization:{stripe_customer_id:"cus_other"}})).reason,"existing_customer_conflict");
  assert.equal((await assess({organization:{stripe_subscription_id:"sub_old"}})).reason,"existing_subscription_conflict");
});

test("used reference and matching active subscription report already active (no write)",async()=>{
  const v=await assess({
    reference:{used_at:new Date(NOW-1000).toISOString()},
    organization:{stripe_customer_id:"cus_fixture",stripe_subscription_id:"sub_fixture",subscription_status:"active"}
  });
  assert.equal(v.status,"already_active");
  assert.equal(v.can_auto_activate,false);
});

test("used reference without matching activation remains blocked",async()=>{
  const v=await assess({reference:{used_at:new Date(NOW-1000).toISOString()}});
  assert.equal(v.reason,"used_reference_requires_manual_investigation");
});

test("invalid expiry and invalid assessment configuration never approve writes",async()=>{
  assert.equal((await assess({reference:{expires_at:"garbage"}})).reason,"invalid_reference_expiry");
  const bad=await assessPaidCheckout({session,catalog,reference,organization,expectedLivemode:"false",nowMs:NOW});
  assert.equal(bad.reason,"invalid_assessment_configuration");
  assert.equal(bad.can_auto_activate,false);
});

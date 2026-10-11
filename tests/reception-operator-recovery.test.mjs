import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {commitOperatorApprovedRecovery} from "../ai-receptionist-host/supabase/functions/billing-reconciliation-commit/commit-core.js";
import {readFileSync} from "node:fs";
const orgId="10000000-0000-4000-8000-000000000002";
const actor="20000000-0000-4000-8000-000000000001";
const token="a1".repeat(32);
const hash=createHash("sha256").update(token).digest("hex");
const now=Date.UTC(2026,9,11,5);
const event="evt_fixture123456789";
const sessId="cs_test_fixture123456789";
const baseSession={
 id:sessId,livemode:false,mode:"subscription",status:"complete",
 payment_status:"paid",metadata:{app:"reception_ai",plan:"starter"},
 customer:"cus_fixture123",subscription:"sub_fixture123",
 payment_link:"plink_fixture123",client_reference_id:token
};
const baseEvent={id:event,livemode:false,type:"checkout.session.completed",data:{object:{id:sessId}}};
const baseRef={token_hash:hash,organization_id:orgId,plan:"starter",expires_at:new Date(now-1000).toISOString(),used_at:null};
const baseOrg={id:orgId,is_internal:false,subscription_status:"trialing",stripe_customer_id:null,stripe_subscription_id:null};
const baseSub={id:"sub_fixture123",status:"active",livemode:false,customer:"cus_fixture123"};
const input={event_id:event,session_id:sessId,expected_organization_id:orgId,
 operator_user_id:actor,expectedLivemode:false,nowMs:now,confirm:"I_APPROVE_PAID_CHECKOUT_RECOVERY"};
function fixture({incident,session,event:ev,reference,org,subscription,commitResult="reconciled"}={}){
 const calls=[], proof={
  incident:{id:event,status:"failed",last_error:"paid_checkout_unlinked: expired"},
  session:{...baseSession},event:{...baseEvent},reference:{...baseRef},
  org:{...baseOrg},sub:{...baseSub}
 };
 if(incident!==undefined)proof.incident=incident;
 if(session!==undefined)proof.session=session;
 if(ev!==undefined)proof.event=ev;
 if(reference!==undefined)proof.reference=reference;
 if(org!==undefined)proof.org=org;
 if(subscription!==undefined)proof.sub=subscription;
 const p={
  getIncident:async eid=>{calls.push("incident");return proof.incident},
  getStripeEvent:async eid=>{calls.push("event");return proof.event},
  getStripeSession:async sid=>{calls.push("session");return proof.session},
  getStripeSubscription:async sub=>{calls.push("subscription");return proof.sub},
  getCatalog:async p=>({active:true,plan:"starter",stripe_payment_link_id:"plink_fixture123"}),
  getReference:async digest=>{calls.push("reference");return digest===hash?proof.reference:null},
  getOrganization:async oid=>{calls.push("org");return proof.org},
  commit:async args=>{calls.push(["COMMIT",args]);return commitResult}
 };
 return {run:overrides=>commitOperatorApprovedRecovery({...input,...overrides},p),calls};
}
const commits=x=>x.calls.filter(c=>Array.isArray(c)&&c[0]==="COMMIT");

test("explicit approval + expired proven payment calls atomic commit exactly once",async()=>{
 const f=fixture(),r=await f.run();
 assert.equal(r.httpStatus,200);
 assert.equal(r.body.result,"reconciled");
 assert.equal(commits(f).length,1);
 assert.equal(commits(f)[0][1].p_organization_id,orgId);
 assert.equal(commits(f)[0][1].p_operator_user_id,actor);
 assert.equal(commits(f)[0][1].p_token_hash,hash);
 assert.equal(r.body.can_auto_activate,false);
 assert.equal(JSON.stringify(r).includes(token),false);
});

test("missing explicit approval never fetches remote evidence or writes",async()=>{
 for(const bad of [undefined,"",false,"approve","I_APPROVE"]){
  const f=fixture(),v=await f.run({confirm:bad});
  assert.equal(v.httpStatus,400);
  assert.equal(f.calls.length,0);
 }
});

test("unverified or missing operator identity cannot write",async()=>{
 const f=fixture(),v=await f.run({operator_user_id:"not_uuid"});
 assert.equal(v.httpStatus,403);assert.equal(f.calls.length,0);
});

test("operator must explicitly confirm the original organization",async()=>{
 const f=fixture(),v=await f.run({expected_organization_id:"10000000-0000-4000-8000-000000000099"});
 assert.equal(v.httpStatus,409);
 assert.equal(commits(f).length,0);
});

test("already used reference cannot produce a second write",async()=>{
 const f=fixture({reference:{...baseRef,used_at:new Date(now-1000).toISOString()}}),v=await f.run();
 assert.equal(v.httpStatus,409);assert.equal(commits(f).length,0);
});

test("only an EXPIRED reference can take exceptional recovery route",async()=>{
 const f=fixture({reference:{...baseRef,expires_at:new Date(now+7200000).toISOString()}}),v=await f.run();
 assert.equal(v.httpStatus,409);
 assert.equal(v.body.reason,"not_an_approved_expired_reference_case");
 assert.equal(commits(f).length,0);
});

test("missing reference or forged Stripe client reference cannot write",async()=>{
 const absent=fixture({reference:null}),res=await absent.run();
 assert.equal(res.httpStatus,409);assert.equal(commits(absent).length,0);
 const forged=fixture({session:{...baseSession,client_reference_id:"b2".repeat(32)}}),res2=await forged.run();
 assert.equal(res2.httpStatus,409);assert.equal(commits(forged).length,0);
});

test("review only considers known failed orphan event types",async()=>{
 const f=fixture({event:{...baseEvent,type:"invoice.paid"}}),res=await f.run();
 assert.equal(res.httpStatus,409);assert.equal(commits(f).length,0);
});

test("payment must be complete and paid",async()=>{
 for(const patch of [{status:"expired"},{payment_status:"unpaid"},{mode:"payment"}]){
  const f=fixture({session:{...baseSession,...patch}}),res=await f.run();
  assert.equal(res.httpStatus,409);assert.equal(commits(f).length,0);
 }
});

test("current Stripe Subscription must be ACTIVE and from matching customer",async()=>{
 for(const patch of [{status:"canceled"},{status:"trialing"},{customer:"cus_other"},{livemode:true},{id:"sub_other"}]){
  const f=fixture({subscription:{...baseSub,...patch}}),res=await f.run();
  assert.equal(res.httpStatus,patch.status==="canceled"||patch.status==="trialing"?409:409);
  assert.equal(res.body.can_auto_activate,false);
  assert.equal(commits(f).length,0);
 }
});

test("other tenant subscription conflict never commits",async()=>{
 const f=fixture({org:{...baseOrg,stripe_subscription_id:"sub_other"}}),res=await f.run();
 assert.equal(res.httpStatus,409);assert.equal(commits(f).length,0);
});

test("only exact successful RPC result counts as approved recovery",async()=>{
 for(const status of [null,"pending","failed",[]]){
  const f=fixture({commitResult:status}),res=await f.run();
  assert.equal(res.httpStatus,409);
  assert.equal(res.body.can_auto_activate,false);
 }
});

test("idempotent database success remains reportable without new activation permission",async()=>{
 const f=fixture({commitResult:"already_reconciled"}),res=await f.run();
 assert.equal(res.httpStatus,200);
 assert.equal(res.body.result,"already_reconciled");
 assert.equal(res.body.can_auto_activate,false);
});

test("commit source contains no direct Stripe writes or bypass of reviewed evidence",()=>{
 const s=readFileSync("ai-receptionist-host/supabase/functions/billing-reconciliation-commit/commit-core.js","utf8");
 const endpoint=readFileSync("ai-receptionist-host/supabase/functions/billing-reconciliation-commit/index.ts","utf8");
 assert.match(s,/reviewPaidCheckoutEvidence/);
 assert.match(s,/subscription\.status!=="active"/);
 assert.match(endpoint,/BILLING_RECOVERY_ENABLED/);
 assert.match(endpoint,/getUser\(/);
 assert.match(endpoint,/is_internal",true/);
 assert.doesNotMatch(endpoint,/Access-Control-Allow-Origin/);
 assert.doesNotMatch(endpoint,/method:"POST"/);
 assert.match(endpoint,/db\.rpc\("commit_paid_checkout_recovery"/);
});

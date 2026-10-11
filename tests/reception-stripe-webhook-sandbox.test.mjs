// Isolated signed-webhook integration fixture. No Stripe, Supabase or internet calls.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as guard from "../ai-receptionist-host/supabase/functions/stripe-webhook/billing-event-guard.js";

const WEBHOOK_FILE = "ai-receptionist-host/supabase/functions/stripe-webhook/index.ts";
const SANDBOX_SECRET = "whsec_local_fixture_not_a_real_stripe_secret";
const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "10000000-0000-4000-8000-000000000002";

class MemoryTable {
  constructor(db, name) { this.db=db; this.name=name; this.filters=[]; this.mode="select"; this.selection=null; this.patch=null; }
  select(fields) { this.selection=fields; return this; }
  eq(field,value) { this.filters.push(row=>row[field]===value); return this; }
  in(field,values) { this.filters.push(row=>values.includes(row[field])); return this; }
  ilike(field,pattern) { const re=new RegExp("^"+pattern.replaceAll("%",".*")+"$","i"); this.filters.push(row=>re.test(String(row[field]||""))); return this; }
  order() { return this; }
  limit() { return this; }
  update(patch) { this.mode="update"; this.patch=patch; return this; }
  async insert(payload) {
    const rows=this.db.tables[this.name]??(this.db.tables[this.name]=[]);
    const items=Array.isArray(payload)?payload:[payload];
    if (this.name==="stripe_events" && items.some(row=>rows.some(old=>old.id===row.id))) {
      return {error:{code:"23505",message:"duplicate fixture event"}};
    }
    rows.push(...items.map(v=>({...v})));
    return {data:null,error:null};
  }
  values() {
    const rows=(this.db.tables[this.name]||[]).filter(row=>this.filters.every(pred=>pred(row)));
    if (this.mode==="update") for(const row of rows)Object.assign(row,this.patch);
    return rows.map(row=>({...row}));
  }
  async maybeSingle() { return {data:this.values()[0]??null,error:null}; }
  async single() {
    const rows=this.values();
    return rows.length===1?{data:rows[0],error:null}:{data:null,error:{message:"missing or multiple fixture rows"}};
  }
  then(resolve,reject){return Promise.resolve({data:this.values(),error:null}).then(resolve,reject);}
}
function fixture() {
  const tables={
    organizations:[
      {id:ORG_A,plan:"trial",subscription_status:"trialing",stripe_customer_id:null,stripe_subscription_id:null},
      {id:ORG_B,plan:"trial",subscription_status:"trialing",stripe_customer_id:null,stripe_subscription_id:null}
    ],
    stripe_events:[],sales_onboarding_invites:[],leads:[],tasks:[],audit_events:[]
  };
  const acceptedRefs=new Map();
  const db={
    tables, from(name){return new MemoryTable(this,name)},
    auth:{admin:{async listUsers(){return{data:{users:[]}}}}},
    async rpc(name,params){
      assert.equal(name,"apply_billing_checkout_ref");
      const ref=acceptedRefs.get(params.p_token_hash);
      if(!ref||ref.used||ref.plan!==params.p_plan)return{data:[],error:null};
      const org=tables.organizations.find(o=>o.id===ref.org);
      if(!org)return{data:[],error:{message:"fixture missing organization"}};
      Object.assign(org,{plan:params.p_plan,subscription_status:params.p_subscription_status,
        stripe_customer_id:params.p_customer_id,stripe_subscription_id:params.p_subscription_id});
      ref.used=true;
      return{data:[{organization_id:org.id}],error:null};
    }
  };
  let handler;
  const tsSource=readFileSync(WEBHOOK_FILE,"utf8");
  const compiled=ts.transpileModule(tsSource,{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
  }}).outputText;
  const sandbox={
    exports:{},module:{exports:{}},crypto:webcrypto,Request,Response,Headers,TextEncoder,Uint8Array,
    console:{log(){},warn(){},error(e){throw Error("Webhook runtime error: "+String(e))}},
    Deno:{
      env:{get(name){return({
        STRIPE_WEBHOOK_SECRET:SANDBOX_SECRET,
        SUPABASE_URL:"https://fixture.invalid",
        SUPABASE_SECRET_KEYS:'{"default":"fixture-secret-not-live"}',
        SUPABASE_SERVICE_ROLE_KEY:"fixture-secret-not-live"
      })[name]}},
      serve(callback){handler=callback}
    },
    require(name){
      if(name==="https://esm.sh/@supabase/supabase-js@2.95.0")return{createClient(){return db}};
      if(name==="./billing-event-guard.js")return guard;
      throw Error("Unmocked webhook import: "+name);
    }
  };
  runInNewContext(compiled,sandbox,{filename:WEBHOOK_FILE,timeout:2000});
  assert.equal(typeof handler,"function");
  const byId=id=>tables.organizations.find(o=>o.id===id);
  async function bindReference(ref,plan,org=ORG_A){
    const digest=createHash("sha256").update(ref).digest("hex");
    acceptedRefs.set(digest,{plan,org,used:false});
  }
  async function deliver(event,{tamper=false,signature=true}={}){
    const payload=JSON.stringify(event);
    const timestamp=Math.floor(Date.now()/1000);
    const digest=createHmac("sha256",SANDBOX_SECRET).update(timestamp+"."+payload).digest("hex");
    const headers={"content-type":"application/json"};
    if(signature)headers["stripe-signature"]='t='+timestamp+',v1='+(tamper?"0".repeat(64):digest);
    const res=await handler(new Request("https://fixture.invalid/stripe-webhook",{method:"POST",headers,body:payload}));
    return {status:res.status,body:await res.text()};
  }
  return {tables,byId,bindReference,deliver};
}
function event(id,type,object){
  return {id,type,data:{object}};
}
function checkout(id,ref,subscription,customer,plan="starter",paymentStatus="paid"){
  return event(id,"checkout.session.completed",{
    id:"cs_fixture_"+id,mode:"subscription",metadata:{app:"reception_ai",plan},
    client_reference_id:ref,subscription,customer,payment_status:paymentStatus
  });
}
function subscriptionEvent(id,type,subscription,customer,status,plan="starter"){
  return event(id,type,{id:subscription,customer,status,metadata:{app:"reception_ai",plan}});
}
function invoiceEvent(id,type,subscription){
  return event(id,type,{id:"in_fixture_"+id,parent:{subscription_details:{subscription}}});
}

test("real handler: signed tenant checkout, retries, renewals and cancellation (memory-only)",async()=>{
  const f=fixture();
  assert.equal((await f.deliver(checkout("evt_invalid","unknown","sub_A","cus_A"),{signature:false})).status,400);
  assert.equal((await f.deliver(checkout("evt_tampered","unknown","sub_A","cus_A"),{tamper:true})).status,400);
  assert.equal(f.tables.stripe_events.length,0,"invalid signatures must not be recorded");
  await f.bindReference("trusted_first_checkout","starter");
  const activation=checkout("evt_activation","trusted_first_checkout","sub_A","cus_A");
  assert.equal((await f.deliver(activation)).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"active");
  assert.equal(f.byId(ORG_A).stripe_subscription_id,"sub_A");
  assert.equal(f.byId(ORG_B).plan,"trial","other tenant unaffected");
  assert.equal((await f.deliver(activation)).status,200);
  assert.equal(f.tables.stripe_events.find(x=>x.id==="evt_activation").attempts,1,"idempotent");
  assert.equal((await f.deliver(invoiceEvent("evt_failed","invoice.payment_failed","sub_A"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"past_due");
  assert.equal((await f.deliver(invoiceEvent("evt_recovered","invoice.paid","sub_A"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"active");
  assert.equal((await f.deliver(subscriptionEvent("evt_cancel","customer.subscription.deleted","sub_A","cus_A","canceled"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"canceled");
  assert.equal((await f.deliver(invoiceEvent("evt_late_invoice","invoice.paid","sub_A"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"canceled","late payment must not revive a canceled subscription");
  await f.bindReference("trusted_renewal_checkout","pro");
  assert.equal((await f.deliver(checkout("evt_renewal","trusted_renewal_checkout","sub_B","cus_A","pro"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"active");
  assert.equal(f.byId(ORG_A).stripe_subscription_id,"sub_B");
  assert.equal(f.byId(ORG_A).plan,"pro");
  assert.equal((await f.deliver(subscriptionEvent("evt_old_sub","customer.subscription.deleted","sub_A","cus_A","canceled"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"active","old subscription cannot cancel renewed tenant");
  assert.equal(f.byId(ORG_A).stripe_subscription_id,"sub_B");
  assert.equal((await f.deliver(subscriptionEvent("evt_current_sub","customer.subscription.updated","sub_B","cus_A","past_due","pro"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"past_due");
  assert.equal((await f.deliver(invoiceEvent("evt_new_paid","invoice.paid","sub_B"))).status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"active");
  assert.equal(f.byId(ORG_B).stripe_subscription_id,null);
  assert.ok(f.tables.stripe_events.length>=9);
});


test("signed paid Checkout without a tenant is not silently marked processed",async()=>{
  const f=fixture();
  const orphan=checkout("evt_orphan_paid","missing_or_expired_ref","sub_unlinked","cus_unlinked");
  const first=await f.deliver(orphan);
  assert.equal(first.status,503,"Stripe must retry unmatched paid Checkout");
  assert.equal(f.byId(ORG_A).subscription_status,"trialing");
  assert.equal(f.byId(ORG_B).subscription_status,"trialing");
  assert.equal(f.tables.stripe_events.find(e=>e.id==="evt_orphan_paid")?.status,"failed");
  assert.match(f.tables.stripe_events.find(e=>e.id==="evt_orphan_paid")?.last_error||"",/paid_checkout_unlinked/);
  const second=await f.deliver(orphan);
  assert.equal(second.status,503);
  assert.equal(f.tables.stripe_events.find(e=>e.id==="evt_orphan_paid")?.attempts,2);
  assert.equal(f.tables.stripe_events.find(e=>e.id==="evt_orphan_paid")?.status,"failed");
  // Simulate resolution of a trusted reference inside the test fixture only.
  // Real expired reference recovery still needs separate operator reconciliation.
  await f.bindReference("missing_or_expired_ref","starter");
  const recovered=await f.deliver(orphan);
  assert.equal(recovered.status,200);
  assert.equal(f.byId(ORG_A).subscription_status,"active");
  assert.equal(f.byId(ORG_A).stripe_subscription_id,"sub_unlinked");
  assert.equal(f.byId(ORG_B).stripe_subscription_id,null);
  assert.equal(f.tables.stripe_events.find(e=>e.id==="evt_orphan_paid")?.status,"processed");
  assert.equal(f.tables.stripe_events.find(e=>e.id==="evt_orphan_paid")?.attempts,3);
});

test("unmatched unpaid Checkout does not claim a completed payment",async()=>{
  const f=fixture();
  const pending=checkout("evt_unpaid_orphan","unknown_ref","sub_pending","cus_pending","starter","unpaid");
  const res=await f.deliver(pending);
  assert.equal(res.status,200);
  assert.equal(f.byId(ORG_A).plan,"trial");
  assert.equal(f.tables.stripe_events.find(e=>e.id==="evt_unpaid_orphan")?.status,"processed");
});


test("paid Checkout with invalid plan metadata requires review instead of fake activation",async()=>{
  const f=fixture();
  const invalidPlan=checkout("evt_invalid_plan","unknown_ref","sub_unknown","cus_unknown","unlisted_plan");
  const result=await f.deliver(invalidPlan);
  assert.equal(result.status,503);
  const tracked=f.tables.stripe_events.find(e=>e.id==="evt_invalid_plan");
  assert.equal(tracked?.status,"failed");
  assert.match(tracked?.last_error||"",/paid_checkout_unlinked/);
  assert.equal(f.byId(ORG_A).plan,"trial");
  assert.equal(f.byId(ORG_B).plan,"trial");
});

test("asynchronous confirmed payment without a tenant remains retryable",async()=>{
  const f=fixture();
  const asyncPaid=checkout("evt_async_paid","expired_ref","sub_async","cus_async","starter","unpaid");
  asyncPaid.type="checkout.session.async_payment_succeeded";
  const res=await f.deliver(asyncPaid);
  assert.equal(res.status,503);
  assert.equal(f.tables.stripe_events.find(e=>e.id==="evt_async_paid")?.status,"failed");
  assert.equal(f.byId(ORG_A).stripe_subscription_id,null);
});

// Executes the ACTUAL TypeScript operator endpoint in an isolated VM.
// No HTTP requests, Stripe secret, Supabase production connection or writes.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {reviewPaidCheckoutEvidence} from "../ai-receptionist-host/supabase/functions/billing-reconciliation-review/review-core.js";

const eventId="evt_fixture123456789",sessionId="cs_test_fixture123456789";
const token="a1".repeat(32);
const digest=createHash("sha256").update(token).digest("hex");
const now=Date.now();
const defaultRows={
 memberships:[{organization_id:"org_internal",user_id:"user_operator",active:true,role:"owner"}],
 organizations:[
  {id:"org_internal",is_internal:true,subscription_status:"active"},
  {id:"org_customer",is_internal:false,subscription_status:"trialing",stripe_customer_id:null,stripe_subscription_id:null}
 ],
 stripe_events:[{id:eventId,status:"failed",last_error:"paid_checkout_unlinked: token expired"}],
 reception_ai_plan_catalog:[{plan:"starter",active:true,stripe_payment_link_id:"plink_fixture"}]
};
const stripe={
 event:{id:eventId,type:"checkout.session.completed",livemode:false,data:{object:{id:sessionId}}},
 session:{id:sessionId,status:"complete",payment_status:"paid",mode:"subscription",livemode:false,metadata:{app:"reception_ai",plan:"starter"},payment_link:"plink_fixture",client_reference_id:token,customer:"cus_fixture",subscription:"sub_fixture"},
 subscription:{id:"sub_fixture",livemode:false,customer:"cus_fixture",status:"active"}
};
class Query{
 constructor(table,rows){this.table=table;this.rows=rows;this.f=[];}
 select(){return this;}
 eq(k,v){this.f.push(r=>r[k]===v);return this;}
 in(k,v){this.f.push(r=>v.includes(r[k]));return this;}
 limit(){return this;}
 values(){return (this.rows[this.table]||[]).filter(r=>this.f.every(p=>p(r)));}
 async maybeSingle(){return{data:this.values()[0]||null,error:null};}
 then(resolve,reject){return Promise.resolve({data:this.values(),error:null}).then(resolve,reject);}
}
function fixture({disabled=false,operator=true,validToken=true,failedIncident=true,subscriptionStatus="active",stripeFailure=false}={}){
 let handler;
 const rows=structuredClone(defaultRows);
 if(!operator)rows.organizations[0].is_internal=false;
 if(!failedIncident)rows.stripe_events[0].status="processed";
 const calls=[];
 const db={
  from(name){return new Query(name,rows);},
  async rpc(name,params){
   calls.push("rpc:"+name);
   assert.equal(name,"lookup_billing_checkout_reference_for_review");
   assert.equal(params.p_token_hash,digest);
   return {data:[{token_hash:digest,organization_id:"org_customer",plan:"starter",expires_at:new Date(Date.now()+3600000).toISOString(),used_at:null}],error:null};
  }
 };
 const env={
  BILLING_REVIEW_ENABLED:disabled?"false":"true",
  SUPABASE_URL:"https://fixture.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_fixture"}',
  SUPABASE_SECRET_KEYS:'{"default":"sb_secret_fixture"}',
  STRIPE_SECRET_KEY:"rk_test_fixtureSecret123"
 };
 const compiled=ts.transpileModule(readFileSync("ai-receptionist-host/supabase/functions/billing-reconciliation-review/index.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const ctx={
  exports:{},console:{error(){},warn(){},log(){}},Response,Request,Headers,AbortSignal,Date,Set,
  Deno:{
    env:{get:k=>env[k]},
    serve(fn){handler=fn;}
  },
  fetch:async (url,opts)=>{
   assert.equal(opts.method,"GET");
   assert.equal(opts.headers.Authorization,"Bearer "+env.STRIPE_SECRET_KEY);
   calls.push("GET:"+url);
   if(stripeFailure)return {ok:false,status:500};
   let obj;
   if(url.endsWith("/events/"+eventId))obj=stripe.event;
   else if(url.endsWith("/checkout/sessions/"+sessionId))obj=stripe.session;
   else if(url.endsWith("/subscriptions/sub_fixture"))obj={...stripe.subscription,status:subscriptionStatus};
   else throw Error("unexpected Stripe fetch");
   return {ok:true,async json(){return obj}};
  },
  require(name){
   if(name==="jsr:@supabase/functions-js/edge-runtime.d.ts")return {};
   if(name==="https://esm.sh/@supabase/supabase-js@2.95.0")return{
    createClient(_url,key){
      if(key==="sb_publishable_fixture")return {auth:{async getUser(){return validToken?{data:{user:{id:"user_operator"}},error:null}:{data:{user:null},error:{message:"invalid"}}}}};
      if(key==="sb_secret_fixture")return db;
      throw Error("unrecognized Supabase key");
    }
   };
   if(name==="./review-core.js")return{reviewPaidCheckoutEvidence};
   throw Error("unexpected import "+name);
  }
 };
 runInNewContext(compiled,ctx,{timeout:2500,filename:"billing-reconciliation-review/index.ts"});
 assert.equal(typeof handler,"function");
 async function post(body={event_id:eventId,session_id:sessionId},authorization="Bearer test-token"){
  const req=new Request("https://fixture.supabase.invalid/functions/v1/billing-reconciliation-review",{
   method:"POST",headers:{"Content-Type":"application/json","Authorization":authorization},body:JSON.stringify(body)
  });
  const res=await handler(req);
  return {status:res.status,body:await res.json()};
 }
 return{handler,post,calls};
}

test("real endpoint returns only reviewed evidence for internal platform owner",async()=>{
 const f=fixture();const res=await f.post();
 assert.equal(res.status,200);assert.equal(res.body.code,"review_completed");
 assert.equal(res.body.assessment.status,"ready_for_authorized_replay");
 assert.equal(res.body.can_auto_activate,false);
 for(const sensitive of ["a1a1","cus_fixture","sub_fixture","sb_secret","rk_test"]){
  assert.equal(JSON.stringify(res).includes(sensitive),false);
 }
 assert.equal(f.calls.filter(x=>x.startsWith("GET:")).length,3);
});
test("kill switch defaults closed (no Stripe calls)",async()=>{
 const f=fixture({disabled:true});const r=await f.post();
 assert.equal(r.status,503);assert.equal(f.calls.length,0);
});
test("operator endpoint enforces bearer token",async()=>{
 const f=fixture();const r=await f.post({}, "");
 assert.equal(r.status,401);assert.equal(f.calls.length,0);
});
test("expired/invalid JWT rejected before any Stripe call",async()=>{
 const f=fixture({validToken:false});const r=await f.post();
 assert.equal(r.status,401);assert.equal(f.calls.length,0);
});
test("a tenant owner is not a platform operator",async()=>{
 const f=fixture({operator:false});const r=await f.post();
 assert.equal(r.status,403);assert.equal(f.calls.length,0);
});
test("only existing failed paid-orphan incident can be inspected",async()=>{
 const f=fixture({failedIncident:false});const r=await f.post();
 assert.equal(r.status,404);
 assert.equal(f.calls.some(x=>x.startsWith("GET:")),false);
});
test("invalid identifiers are rejected without remote access",async()=>{
 const f=fixture();const r=await f.post({event_id:"bad",session_id:"bad"});
 assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
test("canceled Stripe subscription blocks automatic replay",async()=>{
 const f=fixture({subscriptionStatus:"canceled"});const r=await f.post();
 assert.equal(r.status,200);assert.equal(r.body.assessment.reason,"stripe_subscription_not_current");
});
test("unexpected Stripe error does not expose secrets or internal data",async()=>{
 const f=fixture({stripeFailure:true});const r=await f.post();
 assert.equal(r.status,503);assert.equal(r.body.code,"review_temporarily_unavailable");
 assert.equal(JSON.stringify(r).includes("Stripe"),false);
});
test("GET cannot trigger reviews or external requests",async()=>{
 const f=fixture();
 const res=await f.handler(new Request("https://fixture.supabase.invalid/functions/v1/billing-reconciliation-review"));
 assert.equal(res.status,405);assert.equal(f.calls.length,0);
});

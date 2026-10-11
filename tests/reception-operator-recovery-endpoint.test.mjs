// Executes the REAL, disabled-by-default recovery endpoint in an isolated Node VM.
// All Stripe and Supabase calls are mocked; NEVER uses live tokens or production DB.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {commitOperatorApprovedRecovery} from "../ai-receptionist-host/supabase/functions/billing-reconciliation-commit/commit-core.js";

const org="10000000-0000-4000-8000-000000000002",op="20000000-0000-4000-8000-000000000001";
const eventId="evt_fixture123456789",sessionId="cs_test_fixture123456789";
const token="a1".repeat(32), digest=createHash("sha256").update(token).digest("hex");
class Query {
 constructor(rows,table){this.rows=rows;this.table=table;this.filters=[];}
 select(){return this;}
 eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 in(k,values){this.filters.push(r=>values.includes(r[k]));return this;}
 limit(){return this;}
 async maybeSingle(){return{data:this.rows[this.table].filter(r=>this.filters.every(fn=>fn(r)))[0]??null,error:null};}
 then(resolve,reject){return Promise.resolve({data:this.rows[this.table].filter(r=>this.filters.every(fn=>fn(r))),error:null}).then(resolve,reject);}
}
function fixture({enabled=true,validToken=true,platformOperator=true,validPaid=true,subscriptionActive=true,returnRPC="reconciled"}={}){
 let handler;const calls=[];
 const rows={
  memberships:[{organization_id:"internal_org",user_id:op,active:true,role:"owner"}],
  organizations:[
   {id:"internal_org",is_internal:platformOperator},
   {id:org,is_internal:false,stripe_customer_id:null,stripe_subscription_id:null,subscription_status:"trialing"}
  ],
  stripe_events:[{id:eventId,status:"failed",last_error:"paid_checkout_unlinked: original reference expired"}],
  reception_ai_plan_catalog:[{plan:"starter",active:true,stripe_payment_link_id:"plink_fixture123"}]
 };
 const payloads={
  event:{id:eventId,livemode:false,type:"checkout.session.completed",data:{object:{id:sessionId}}},
  session:{id:sessionId,livemode:false,mode:"subscription",status:"complete",
    payment_status:validPaid?"paid":"unpaid",metadata:{app:"reception_ai",plan:"starter"},
    customer:"cus_fixture123",subscription:"sub_fixture123",payment_link:"plink_fixture123",client_reference_id:token},
  subscription:{id:"sub_fixture123",livemode:false,customer:"cus_fixture123",
    status:subscriptionActive?"active":"canceled"}
 };
 const env={
  BILLING_RECOVERY_ENABLED:enabled?"true":"false",
  SUPABASE_URL:"https://fake.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_fixture"}',
  SUPABASE_SECRET_KEYS:'{"default":"sb_secret_fixture"}',
  STRIPE_SECRET_KEY:"rk_test_fixtureSecret123"
 };
 const db={
  from(name){if(!(name in rows))throw Error("unexpected table "+name);return new Query(rows,name);},
  async rpc(name,args){
   calls.push(["RPC",name,args]);
   if(name==="lookup_billing_checkout_reference_for_review"){
     assert.equal(args.p_token_hash,digest);
     return {data:[{token_hash:digest,organization_id:org,plan:"starter",
       expires_at:new Date(Date.now()-60000).toISOString(),used_at:null}],error:null};
   }
   if(name==="commit_paid_checkout_recovery")return{data:returnRPC,error:null};
   throw Error("unexpected RPC "+name);
  }
 };
 const source=readFileSync("ai-receptionist-host/supabase/functions/billing-reconciliation-commit/index.ts","utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
 }}).outputText;
 const vmContext={
  exports:{},console:{error(){},warn(){},log(){}},Date,Set,Response,Request,Headers,AbortSignal,
  Deno:{env:{get:key=>env[key]},serve(fn){handler=fn;}},
  fetch:async(url,params)=>{
   assert.equal(params.method,"GET");
   assert.equal(params.headers.Authorization,"Bearer "+env.STRIPE_SECRET_KEY);
   calls.push(["GET",url]);
   if(url.endsWith("/events/"+eventId))return{ok:true,async json(){return payloads.event}};
   if(url.endsWith("/checkout/sessions/"+sessionId))return{ok:true,async json(){return payloads.session}};
   if(url.endsWith("/subscriptions/sub_fixture123"))return{ok:true,async json(){return payloads.subscription}};
   throw Error("unexpected provider URL");
  },
  require(name){
   if(name==="jsr:@supabase/functions-js/edge-runtime.d.ts")return{};
   if(name==="https://esm.sh/@supabase/supabase-js@2.95.0")return{createClient:(_,key)=>{
    if(key==="sb_publishable_fixture")return{auth:{async getUser(){
     return validToken?{data:{user:{id:op}},error:null}:{data:{user:null},error:{message:"expired"}};
    }}};
    if(key==="sb_secret_fixture")return db;
    throw Error("unrecognized client key");
   }};
   if(name==="./commit-core.js")return{commitOperatorApprovedRecovery};
   throw Error("unexpected VM import "+name);
  }
 };
 runInNewContext(compiled,vmContext,{filename:"billing-reconciliation-commit/index.ts",timeout:2500});
 assert.equal(typeof handler,"function");
 const standardBody={event_id:eventId,session_id:sessionId,
  expected_organization_id:org,confirm:"I_APPROVE_PAID_CHECKOUT_RECOVERY"};
 async function post(body=standardBody,auth="Bearer fixture_jwt"){
  const req=new Request("https://fake.supabase.invalid/functions/v1/billing-reconciliation-commit",{
   method:"POST",headers:{"Authorization":auth,"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  const res=await handler(req);
  return{status:res.status,body:await res.json()};
 }
 return{handler,post,calls,body:standardBody};
}
const written=f=>f.calls.filter(v=>Array.isArray(v)&&v[0]==="RPC"&&v[1]==="commit_paid_checkout_recovery");

test("real HTTP handler commits only with valid operator, paid active Stripe and typed confirmation",async()=>{
 const f=fixture(),res=await f.post();
 assert.equal(res.status,200);assert.equal(res.body.result,"reconciled");
 assert.equal(written(f).length,1);
 assert.equal(written(f)[0][2].p_organization_id,org);
 assert.equal(written(f)[0][2].p_operator_user_id,op);
 assert.equal(res.body.can_auto_activate,false);
 for(const secret of [token,digest,"rk_test_fixtureSecret123"]){
  assert.equal(JSON.stringify(res).includes(secret),false);
 }
});
test("kill switch prevents all external calls",async()=>{
 const f=fixture({enabled:false}),res=await f.post();
 assert.equal(res.status,503);assert.equal(f.calls.length,0);
});
test("missing explicit operator confirmation blocks any Stripe write",async()=>{
 const f=fixture(),res=await f.post({...f.body,confirm:null});
 assert.equal(res.status,400);
 assert.equal(written(f).length,0);
 assert.equal(f.calls.filter(v=>v[0]==="GET").length,0);
});
test("missing authorization header blocks all processing",async()=>{
 const f=fixture(),res=await f.post(f.body,"");
 assert.equal(res.status,401);assert.equal(f.calls.length,0);
});
test("expired authentication blocks Stripe and recovery RPC",async()=>{
 const f=fixture({validToken:false}),res=await f.post();
 assert.equal(res.status,401);assert.equal(written(f).length,0);
});
test("non-platform tenant owner cannot approve recovery",async()=>{
 const f=fixture({platformOperator:false}),res=await f.post();
 assert.equal(res.status,403);assert.equal(written(f).length,0);
});
test("unpaid Checkout blocks recovery",async()=>{
 const f=fixture({validPaid:false}),res=await f.post();
 assert.equal(res.status,409);assert.equal(written(f).length,0);
});
test("canceled current Stripe subscription cannot be recovered",async()=>{
 const f=fixture({subscriptionActive:false}),res=await f.post();
 assert.equal(res.status,409);assert.equal(written(f).length,0);
});
test("operator must type matching expected organization",async()=>{
 const f=fixture(),res=await f.post({...f.body,
  expected_organization_id:"10000000-0000-4000-8000-000000000099"});
 assert.equal(res.status,409);assert.equal(written(f).length,0);
});
test("failed RPC never claims success",async()=>{
 const f=fixture({returnRPC:"blocked"}),res=await f.post();
 assert.equal(res.status,409);assert.equal(res.body.ok,false);
});
test("GET is not a recovery operation",async()=>{
 const f=fixture();
 const response=await f.handler(new Request("https://fake.supabase.invalid/functions/v1/billing-reconciliation-commit"));
 assert.equal(response.status,405);assert.equal(f.calls.length,0);
});

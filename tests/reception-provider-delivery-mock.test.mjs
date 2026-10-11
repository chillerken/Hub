// Execute real workflow-runner helper code against a fake provider sink.
// No real Resend tokens, network calls, emails, or customer contact.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

const A="10000000-0000-4000-8000-000000000001";
const B="10000000-0000-4000-8000-000000000002";
const source=readFileSync("ai-receptionist-host/supabase/functions/workflow-runner/index.ts","utf8");
const instrumented=source+"\n;globalThis.testHooks={sendResend,workflowDataGuard,actionMessage,finish};\n";
const output=ts.transpileModule(instrumented,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;

function harness({response={ok:true,id:"email_accepted_fixture"},httpStatus=200,throwNetwork=false}={}){
 const requests=[],finishes=[],acceptedByKey=new Map(),dbCalls=[];
 let acceptedUnique=0;
 const mockFetch=async(url,options)=>{
  assert.equal(url,"https://api.resend.com/emails");
  assert.equal(options.method,"POST");
  assert.ok(options.headers.Authorization.startsWith("Bearer test-secret-"));
  const payload=JSON.parse(options.body);
  requests.push({headers:options.headers,body:payload,url});
  if(throwNetwork)throw new Error("simulated socket lost after request");
  if(response.ok){
   const key=options.headers["Idempotency-Key"];
   if(!acceptedByKey.has(key)){
    acceptedByKey.set(key,response.id);
    acceptedUnique++;
   }
   return {ok:true,status:httpStatus,headers:new Headers(),async json(){return {id:acceptedByKey.get(key)};}};
  }
  return {ok:false,status:httpStatus,statusText:"test failure",headers:new Headers(),async json(){return{name:response.errorName||"provider_error",message:"synthetic provider error"}}};
 };
 const context={
  exports:{},console:{error(){},log(){},warn(){}},Date,Intl,Number,String,JSON,Set,Array,
  Request,Response,Headers,URL,TextEncoder,Uint8Array,crypto:webcrypto,
  fetch:mockFetch,globalThis:null,
  Deno:{env:{get(){return undefined;}},serve(fn){assert.equal(typeof fn,"function");}},
  require(name){
   if(name==="https://esm.sh/@supabase/supabase-js@2.95.0")return{createClient(){throw Error("Real Supabase access forbidden")}};
   throw Error("Unexpected dependency "+name);
  }
 };
 delete context.globalThis; // VM supplies its own globalThis.
 runInNewContext(output,context,{filename:"workflow-runner/index.ts",timeout:5000});
 const db={
  async rpc(name,args){
   dbCalls.push(name);
   if(name==="get_integration_credential")return{data:"test-secret-"+args.p_organization_id,error:null};
   if(name==="finish_workflow_action"){finishes.push(args);return{data:true,error:null};}
   throw Error("Unapproved RPC "+name);
  }
 };
 const make=(org=A,type="appointment_confirmation")=>({
   action:{id:org+"-action",organization_id:org,lead_id:org+"-lead",
     action_type:type,channel:"auto",attempts:0,
     idempotency_key:"appointment:"+org+":confirmation",payload:{appointment_id:org+"-appointment"}},
   integration:{id:org+"-provider",organization_id:org,provider:"resend",
     config:{sender_email:"robot@example.test",sender_name:org===A?"Garage A":"Salon B"}},
   lead:{id:org+"-lead",name:"Synthetic Recipient",email:org===A?"a@example.test":"b@example.test",
     contact_consent_at:"2026-10-11T12:00:00Z"},
   profile:{business_name:org===A?"Garage A":"Salon B",locale:"nl-BE"},
   appointment:{id:org+"-appointment",status:"confirmed",
     start_at:"2026-11-18T14:00:00Z",end_at:"2026-11-18T15:00:00Z",
     timezone:"Europe/Brussels"}
 });
 return {hooks:context.testHooks,requests,finishes,db,make,acceptedUnique:()=>acceptedUnique,dbCalls};
}

test("real Resend adapter returns a traceable accepted receipt and tenant branding",async()=>{
 const h=harness(),x=h.make();
 assert.equal(h.hooks.workflowDataGuard(x.action,x.lead,x.appointment,null),null);
 const result=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
 assert.equal(result.outcome,"completed");
 assert.equal(result.provider_reference,"email_accepted_fixture");
 assert.equal(result.response_meta.delivered,false,"Provider accept is not inbox delivery");
 assert.equal(h.requests.length,1);
 assert.match(h.requests[0].headers["Idempotency-Key"],/^rai-email-[a-f0-9]{64}$/);
 assert.deepEqual(Array.from(h.requests[0].body.to),["a@example.test"]);
 assert.match(h.requests[0].body.subject,/Afspraak bevestigd – Garage A/);
 await h.hooks.finish(h.db,x.action,result.outcome,result);
 assert.equal(h.finishes[0].p_provider_reference,"email_accepted_fixture");
 assert.equal(h.finishes[0].p_outcome,"completed");
});

test("provider-level idempotency deduplicates exact repeated email content",async()=>{
 const h=harness(),x=h.make();
 const one=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
 const two=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
 assert.equal(one.provider_reference,two.provider_reference);
 assert.equal(h.requests.length,2);
 assert.equal(h.acceptedUnique(),1,"Fake provider accepted only one logical delivery");
});

test("each tenant uses a separate provider credential, address, idempotency key and brand",async()=>{
 const h=harness(),a=h.make(A),b=h.make(B);
 const sentA=await h.hooks.sendResend(h.db,a.action,a.integration,a.lead,a.profile,a.appointment);
 const sentB=await h.hooks.sendResend(h.db,b.action,b.integration,b.lead,b.profile,b.appointment);
 assert.equal(sentA.outcome,"completed");
 assert.equal(sentB.outcome,"completed");
 assert.equal(h.requests.length,2);
 assert.notEqual(h.requests[0].headers.Authorization,h.requests[1].headers.Authorization);
 assert.notEqual(h.requests[0].headers["Idempotency-Key"],h.requests[1].headers["Idempotency-Key"]);
 assert.equal(h.requests[1].body.to[0],"b@example.test");
 assert.match(h.requests[1].body.subject,/Salon B/);
});

test("no consent prevents customer email even with valid provider integration",async()=>{
 const h=harness(),x=h.make();
 x.lead.contact_consent_at=null;
 assert.equal(h.hooks.workflowDataGuard(x.action,x.lead,x.appointment,null).code,"contact_consent_required");
 const result=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
 assert.equal(result.outcome,"failed");
 assert.equal(result.error_code,"contact_consent_required");
 assert.equal(h.requests.length,0);
});

test("unapproved appointment is rejected by the worker guard before calendar or confirmation",()=>{
 const h=harness(),x=h.make();
 x.appointment.status="requested";
 x.action.action_type="calendar_request";
 assert.equal(h.hooks.workflowDataGuard(x.action,x.lead,x.appointment,null).code,"human_confirmation_required");
 x.action.action_type="appointment_confirmation";
 // Status check also exists in the runner dispatch path, not just the data guard.
 assert.match(source,/action\.action_type==="appointment_confirmation" && appointment\?\.status!=="confirmed"/);
});

test("provider 200 without message ID is blocked, never claimed as delivered",async()=>{
 const h=harness({response:{ok:true,id:null}}),x=h.make();
 const result=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
 assert.equal(result.outcome,"blocked");
 assert.equal(result.error_code,"delivery_unknown");
 assert.equal(result.provider_reference,undefined);
});

test("provider 500 and network uncertainty require manual reconciliation, not automatic retries",async()=>{
 for(const config of [{response:{ok:false},httpStatus:500},{throwNetwork:true}]){
  const h=harness(config),x=h.make();
  const result=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
  assert.equal(result.outcome,"blocked");
  assert.equal(result.error_code,"delivery_unknown");
  assert.match(result.error_message,/delivery status is unknown/i);
 }
});

test("rate-limit response is retryable with the same idempotency key",async()=>{
 const h=harness({response:{ok:false},httpStatus:429}),x=h.make();
 const out=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
 assert.equal(out.outcome,"retry");
 assert.equal(out.error_code,"rate_limited");
 assert.ok(out.retry_after_seconds>0);
 assert.match(h.requests[0].headers["Idempotency-Key"],/^rai-email-[a-f0-9]{64}$/);
});

test("rescheduling changes the provider key without breaking retry deduplication",async()=>{
 const h=harness(),x=h.make();
 const first=await h.hooks.sendResend(h.db,x.action,x.integration,x.lead,x.profile,x.appointment);
 const oldKey=h.requests[0].headers["Idempotency-Key"];
 assert.equal(first.outcome,"completed");
 const rescheduled={...x.appointment,start_at:"2026-11-19T14:00:00Z",end_at:"2026-11-19T15:00:00Z"};
 const changedAction={...x.action,payload:{...x.action.payload,rescheduled:true}};
 const next=await h.hooks.sendResend(h.db,changedAction,x.integration,x.lead,x.profile,rescheduled);
 const newKey=h.requests[1].headers["Idempotency-Key"];
 assert.equal(next.outcome,"completed");
 assert.notEqual(oldKey,newKey,"Different message content requires a new provider key");
 assert.equal(h.acceptedUnique(),2);
 await h.hooks.sendResend(h.db,changedAction,x.integration,x.lead,x.profile,rescheduled);
 assert.equal(h.requests[2].headers["Idempotency-Key"],newKey);
 assert.equal(h.acceptedUnique(),2,"Same reschedule retry remains deduplicated");
});

test("only Resend concurrent-idempotency 409 can retry; changed-payload 409 must fail",async()=>{
 // Independent harness using an explicit provider error code.
 const concurrent=harness({response:{ok:false,errorName:"concurrent_idempotent_requests"},httpStatus:409});
 const once=concurrent.make();
 const retry=await concurrent.hooks.sendResend(concurrent.db,once.action,once.integration,once.lead,once.profile,once.appointment);
 assert.equal(retry.outcome,"retry");
 assert.equal(retry.error_code,"concurrent_idempotent_requests");
 const changed=harness({response:{ok:false,errorName:"invalid_idempotent_request"},httpStatus:409});
 const twice=changed.make();
 const bad=await changed.hooks.sendResend(changed.db,twice.action,twice.integration,twice.lead,twice.profile,twice.appointment);
 assert.equal(bad.outcome,"failed");
 assert.equal(bad.error_code,"provider_rejected");
});

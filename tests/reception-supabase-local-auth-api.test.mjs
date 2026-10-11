// True Supabase Auth, PostgREST and Edge HTTP test on a disposable GitHub runner.
// No remote Supabase token, domain, provider, recipient or customer data.
import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";

const base=process.env.API_URL||"";
assert.match(base,/^http:\/\/(?:127\.0\.0\.1|localhost):54321\/?$/,
 "Refuse to run against hosted or nonlocal Supabase");
assert.equal(process.env.RECEPTION_CI_ISOLATED,"yes","No external Supabase");
const anon=process.env.ANON_KEY,service=process.env.SERVICE_ROLE_KEY;
assert.ok(anon&&service,"Local CLI-generated test-only API keys required");
const A="10000000-0000-4000-8000-000000000001";
const B="10000000-0000-4000-8000-000000000002";
const UUID_PREFIX="20000000-0000-4000-8000-00000000000";
const admin=createClient(base,service,{auth:{persistSession:false}});
const visitor=()=>createClient(base,anon,{auth:{persistSession:false}});
const check=(r,context)=>{
 assert.equal(r.error,null,context+": "+String(r.error?.message||""));
 return r.data;
};
const users=[
 {name:"Owner A",org:A,email:"qa-owner-a@example.test",role:"owner"},
 {name:"Owner B",org:B,email:"qa-owner-b@example.test",role:"owner"},
 {name:"Viewer A",org:A,email:"qa-viewer-a@example.test",role:"viewer"}
];
const password="OnlyIsolatedTesting!2026";
const until=new Date(Date.now()+86400000*30).toISOString();
async function functionCall(name,body,{origin="https://alpha.example.invalid",jwt=anon}={}){
 const res=await fetch(base+"/functions/v1/"+name,{
  method:"POST",
  headers:{"Content-Type":"application/json","apikey":anon,
   "authorization":"Bearer "+jwt,"origin":origin},
  body:JSON.stringify(body)
 });
 return {status:res.status,body:await res.json().catch(()=>({}))};
}
async function waitEdge(){
 const deadline=Date.now()+40000;
 while(Date.now()<deadline){
  try{
   const res=await fetch(base+"/functions/v1/public-reception-chat",{method:"OPTIONS"});
   if(res.status!==502&&res.status!==503&&res.status!==504)return;
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,1200));
 }
 throw Error("Local Edge runtime did not become reachable");
}

test("real local Supabase Auth + PostgREST + Edge: two tenants, human booking and RLS",{
 timeout:125000
},async()=>{
 for(const u of users){
  const result=await admin.auth.admin.createUser({
   email:u.email,password,email_confirm:true,
   user_metadata:{display:"synthetic-ci-fixture"}
  });
  const user=check(result,"create local auth user").user;
  u.userId=user.id;
 }
 const orgs=users.slice(0,2).map(u=>({
  id:u.org,is_internal:true,plan:"trial",status:"active",trial_ends_at:until
 }));
 check(await admin.from("organizations").insert(orgs),"seed tenant orgs");
 check(await admin.from("business_profiles").insert([
  {organization_id:A,business_name:"Garage A",receptionist_name:"Ava",
   widget_token:"widget-A",widget_enabled:true,
   widget_allowed_domains:["alpha.example.invalid"],locale:"nl-BE",
   automation_enabled:true,services:["Auto"],preferred_followup_channel:"email"},
  {organization_id:B,business_name:"Salon B",receptionist_name:"Berta",
   widget_token:"widget-B",widget_enabled:true,
   widget_allowed_domains:["beta.example.invalid"],locale:"nl-BE",
   automation_enabled:true,services:["Hair"],preferred_followup_channel:"email"}
 ]),"seed tenant settings");
 check(await admin.from("memberships").insert(users.map(u=>({
  organization_id:u.org,user_id:u.userId,role:u.role,active:true
 }))),"seed real auth tenant memberships");
 const clients={};
 for(const u of users){
  const client=visitor();
  const signed=await client.auth.signInWithPassword({email:u.email,password});
  check(signed,"sign in "+u.name);
  assert.equal(signed.data.user.id,u.userId);
  u.jwt=signed.data.session.access_token;
  clients[u.name]=client;
 }
 const a=clients["Owner A"],b=clients["Owner B"],viewer=clients["Viewer A"];
 const oa=check(await a.from("organizations").select("id"),"tenant A read org");
 assert.deepEqual(oa.map(o=>o.id),[A]);
 assert.deepEqual(check(await b.from("organizations").select("id"),"tenant B read org").map(o=>o.id),[B]);
 assert.deepEqual(check(await visitor().from("organizations").select("id"),"anon org"),[]);
 assert.deepEqual(check(await a.from("business_profiles").select("business_name"),"A profile")
  .map(x=>x.business_name),["Garage A"]);
 assert.deepEqual(check(await b.from("business_profiles").select("business_name"),"B profile")
  .map(x=>x.business_name),["Salon B"]);

 const blockedProfile=check(await a.from("business_profiles")
  .update({business_name:"UNAUTHORIZED CROSS-TENANT"})
  .eq("organization_id",B).select("organization_id"),"cross-tenant profile update");
 assert.equal(blockedProfile.length,0);
 const viewerChange=check(await viewer.from("business_profiles")
  .update({business_name:"UNAUTHORIZED VIEWER"})
  .eq("organization_id",A).select("organization_id"),"viewer profile update");
 assert.equal(viewerChange.length,0);
 const allowed=check(await a.from("business_profiles")
  .update({receptionist_name:"Ava QA"}).eq("organization_id",A)
  .select("receptionist_name"),"authorized own profile update");
 assert.equal(allowed[0].receptionist_name,"Ava QA");
 const directAppointment=await a.from("appointments").update({status:"confirmed"})
  .eq("organization_id",A).select("id");
 assert.ok(directAppointment.error,"Direct authenticated UPDATE of appointments forbidden");
 const directDispatch=await a.from("workflow_actions").insert({
  organization_id:A,action_type:"appointment_confirmation",channel:"email",
  status:"pending",priority:"high",idempotency_key:"forbidden"
 });
 assert.ok(directDispatch.error,"Direct authenticated dispatch forbidden");

 await waitEdge();
 const malformedOrigin=await functionCall("public-reception-chat",{
  widget_token:"widget-A",message:"Ik wil een afspraak boeken"
 },{origin:"https://beta.example.invalid"});
 assert.equal(malformedOrigin.status,403);
 const request=await functionCall("public-reception-chat",{
  widget_token:"widget-A",name:"Synthetic A",email:"qa-contact-a@example.test",
  contact_consent:true,message:"Ik wil een afspraak maken op 18/11/2026 om 14u00"
 });
 assert.equal(request.status,200,"Local Edge intake: "+JSON.stringify(request.body));
 assert.ok(request.body.appointment_id);
 const firstId=request.body.appointment_id;
 const [leads,appts,tasks,actions]=await Promise.all([
  admin.from("leads").select("*").eq("organization_id",A),
  admin.from("appointments").select("*").eq("organization_id",A),
  admin.from("tasks").select("*").eq("organization_id",A),
  admin.from("workflow_actions").select("*").eq("organization_id",A)
 ]);
 assert.equal(check(leads,"A lead").length,1);
 assert.equal(check(appts,"A booking").length,1);
 assert.equal(appts.data[0].status,"requested");
 assert.equal(check(tasks,"A task").length,1);
 assert.equal(check(actions,"A preapproval actions").length,0,
  "No calendar/email actions before human confirmation");
 assert.deepEqual(check(await b.from("leads").select("id"),"tenant B cannot read A leads"),[]);

 const cross=await functionCall("operations-admin",{
  action:"confirm_appointment",appointment_id:firstId
 },{jwt:users[1].jwt});
 assert.equal(cross.status,404);
 const deniedViewer=await functionCall("operations-admin",{
  action:"confirm_appointment",appointment_id:firstId
 },{jwt:users[2].jwt});
 assert.equal(deniedViewer.status,403);
 const approved=await functionCall("operations-admin",{
  action:"confirm_appointment",appointment_id:firstId
 },{jwt:users[0].jwt});
 assert.equal(approved.status,200,"Local Edge operator: "+JSON.stringify(approved.body));
 assert.equal(approved.body.appointment.status,"confirmed");
 const logged=check(await admin.from("audit_events").select("event_type")
  .eq("organization_id",A),"operator audit");
 assert.equal(logged.filter(x=>x.event_type==="appointment.confirmed").length,1);
 const queued=check(await admin.from("workflow_actions").select("action_type,status")
  .eq("organization_id",A),"post approval actions");
 assert.equal(queued.length,2);
 assert.deepEqual(queued.map(x=>x.action_type).sort(),
  ["appointment_confirmation","calendar_request"]);
 assert.ok(queued.every(x=>x.status==="pending"));
 const second=await functionCall("public-reception-chat",{
  widget_token:"widget-A",lead_id:request.body.lead_id,
  conversation_id:request.body.conversation_id,
  message:"Ik wil een nieuwe afspraak maken op 19/11/2026 om 15u00"
 });
 assert.equal(second.status,200,"Second request: "+JSON.stringify(second.body));
 assert.notEqual(second.body.appointment_id,firstId);
 assert.equal(check(await admin.from("appointments").select("id,status")
  .eq("id",firstId),"original confirmed").at(0).status,"confirmed");

 const bReq=await functionCall("public-reception-chat",{
  widget_token:"widget-B",name:"Synthetic B",email:"qa-contact-b@example.test",
  contact_consent:true,message:"Ik wil een afspraak maken op 20/11/2026 om 10u00"
 },{origin:"https://beta.example.invalid"});
 assert.equal(bReq.status,200,"Second tenant intake: "+JSON.stringify(bReq.body));
 assert.equal(bReq.body.business_name,"Salon B");
 const hijack=await functionCall("public-reception-chat",{
  widget_token:"widget-B",lead_id:request.body.lead_id,
  conversation_id:request.body.conversation_id,
  message:"Mijn afspraak graag wijzigen"
 },{origin:"https://beta.example.invalid"});
 assert.equal(hijack.status,404,"Cross-tenant conversation hijack denied");
 const bAppts=check(await b.from("appointments").select("id"),"tenant B can see own");
 assert.equal(bAppts.length,1);
 assert.equal(check(await a.from("appointments").select("id"),"tenant A appointments").length,2);
});

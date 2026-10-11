// Executes the ACTUAL public chat and operations-admin HTTP handlers with a
// synthetic tenant-scoped Supabase adapter. No live credentials or customer writes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID, webcrypto } from "node:crypto";
import ts from "typescript";
import { isAppointmentRequest } from "../ai-receptionist-host/supabase/functions/public-reception-chat/intent.js";
import { VISITOR_EDITABLE_BOOKING_STATUSES, appointmentRequestReply } from "../ai-receptionist-host/supabase/functions/public-reception-chat/booking-guard.mjs";

const A="10000000-0000-4000-8000-000000000001";
const B="10000000-0000-4000-8000-000000000002";
const persons={
 operatorA:{id:"20000000-0000-4000-8000-000000000001",org:A,role:"owner"},
 operatorB:{id:"20000000-0000-4000-8000-000000000002",org:B,role:"owner"},
 viewerA:{id:"20000000-0000-4000-8000-000000000003",org:A,role:"viewer"}
};
const trialEnd=new Date(Date.now()+86400000).toISOString();

function setup(){
 const data={
  organizations:[
   {id:A,is_internal:true,plan:"trial",trial_ends_at:trialEnd,status:"active"},
   {id:B,is_internal:true,plan:"trial",trial_ends_at:trialEnd,status:"active"}
  ],
  business_profiles:[
   {organization_id:A,business_name:"Garage A",receptionist_name:"Ava",
    widget_token:"widget-A",widget_enabled:true,widget_allowed_domains:["alpha.example.invalid"],
    automation_enabled:true,locale:"nl-BE",services:["Onderhoud"]},
   {organization_id:B,business_name:"Salon B",receptionist_name:"Berta",
    widget_token:"widget-B",widget_enabled:true,widget_allowed_domains:["beta.example.invalid"],
    automation_enabled:true,locale:"nl-BE",services:["Hairstyling"]}
  ],
  memberships:Object.entries(persons).map(([token,p])=>({
    organization_id:p.org,user_id:p.id,role:p.role,active:true
  })),
  leads:[],conversations:[],messages:[],appointments:[],tasks:[],handoffs:[],
  audit_events:[],workflow_actions:[],widget_rate_limits:[],reception_ai_plan_catalog:[]
 };
 const writes=[];
 class Query {
  constructor(name,user=null){this.name=name;this.user=user;this.predicates=[];this.sort=null;this.cap=null;this.pending=null;this.selection=null;this.countOpt=null;}
  select(fields="*",options={}){this.selection=fields;this.countOpt=options;return this;}
  eq(key,val){this.predicates.push(row=>row[key]===val);return this;}
  gte(key,val){this.predicates.push(row=>String(row[key]||"")>=String(val));return this;}
  in(key,vals){this.predicates.push(row=>vals.includes(row[key]));return this;}
  order(key,opts={}){this.sort={key,ascending:opts.ascending!==false};return this;}
  limit(n){this.cap=n;return this;}
  insert(value){this.pending={type:"insert",value};return this;}
  update(value){this.pending={type:"update",value};return this;}
  allowed(row){
   if(!this.user)return true;
   if(this.name==="memberships")return row.user_id===this.user.id;
   if(this.name==="organizations")return row.id===this.user.org;
   if(this.name==="business_profiles")return row.organization_id===this.user.org;
   return row.organization_id===this.user.org;
  }
  execute(){
   if(!data[this.name])throw Error("Unexpected table "+this.name);
   let result=data[this.name].filter(row=>this.allowed(row)&&this.predicates.every(fn=>fn(row)));
   if(this.pending?.type==="insert"){
    const inserts=Array.isArray(this.pending.value)?this.pending.value:[this.pending.value];
    result=inserts.map(v=>{
      if(this.user && v.organization_id!==this.user.org)throw Error("RLS violation");
      const row={id:randomUUID(),created_at:new Date().toISOString(),...v};
      data[this.name].push(row);writes.push([this.name,"insert",row.id]);return row;
    });
   }
   if(this.pending?.type==="update"){
    for(const row of result){Object.assign(row,this.pending.value);writes.push([this.name,"update",row.id]);}
   }
   if(this.sort)result.sort((a,b)=>{
    let c=String(a[this.sort.key]||"").localeCompare(String(b[this.sort.key]||""));
    return this.sort.ascending?c:-c;
   });
   if(this.cap!==null)result=result.slice(0,this.cap);
   if(this.countOpt?.head===true)return {data:null,count:result.length,error:null};
   return {data:structuredClone(result),error:null};
  }
  then(resolve,reject){return Promise.resolve().then(()=>this.execute()).then(resolve,reject);}
  single(){const r=this.execute();return Promise.resolve(r.data?.length===1?{data:r.data[0],error:null}:{data:null,error:{message:"not_single"}});}
  maybeSingle(){const r=this.execute();return Promise.resolve({data:r.data?.[0]||null,error:null});}
 }
 const client=(key,options={})=>{
  if(key==="service")return{
   from:t=>new Query(t),
   rpc:async(action)=>action==="consume_ai_daily_quota"?{data:true,error:null}:{data:null,error:{message:"unexpected_rpc"}}
  };
  if(key==="anon"){
   const authorization=String(options.global?.headers?.Authorization||"");
   const who=persons[authorization.replace(/^Bearer /,"")];
   return {
    auth:{getUser:async token=>{
      const found=persons[token];
      return found?{data:{user:{id:found.id}},error:null}:{data:{user:null},error:{message:"unauthorized"}};
    }},
    from:t=>new Query(t,who||{id:"invalid",org:"unknown"})
   };
  }
  throw Error("Unknown API key in isolated mock");
 };
 function load(name){
  let handler;
  const code=readFileSync("ai-receptionist-host/supabase/functions/"+name+"/index.ts","utf8");
  const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const context={
   exports:{},Date,URL,Request,Response,Headers,AbortController,
   TextEncoder,Uint8Array,Array,Set,Map,JSON,Number,String,Promise,crypto:webcrypto,structuredClone,
   console:{log(){},error(){},warn(){}},
   setTimeout,clearTimeout,
   Deno:{env:{get:k=>({
      SUPABASE_URL:"https://fixture.invalid",SUPABASE_SECRET_KEYS:'{"default":"service"}',
      SUPABASE_SERVICE_ROLE_KEY:"service",SUPABASE_ANON_KEY:"anon"
     }[k])},serve(fn){handler=fn;}},
   require(mod){
    if(mod==="https://esm.sh/@supabase/supabase-js@2.95.0")return {createClient:(url,key,opts)=>client(key,opts)};
    if(mod==="./intent.js")return {isAppointmentRequest};
    if(mod==="./booking-guard.mjs")return {VISITOR_EDITABLE_BOOKING_STATUSES,appointmentRequestReply};
    throw Error("Unexpected module "+mod);
   }
  };
  runInNewContext(compiled,context,{timeout:3500,filename:name+"/index.ts"});
  assert.equal(typeof handler,"function");return handler;
 }
 const chat=load("public-reception-chat");
 const admin=load("operations-admin");
 async function post(handler,body,origin="https://alpha.example.invalid",auth=null){
  const response=await handler(new Request("https://fixture.invalid/functions/v1/test",{
   method:"POST",headers:{"Content-Type":"application/json","Origin":origin,...(auth?{Authorization:"Bearer "+auth}:{})},
   body:JSON.stringify(body)
  }));
  return {status:response.status,data:await response.json()};
 }
 return{data,writes,
  chat:(body,origin)=>post(chat,body,origin),
  admin:(action,token)=>post(admin,action,"https://alpha.example.invalid",token)
 };
}

test("two tenants: complete intake -> booking -> human approval -> internal follow-up",async()=>{
 const f=setup();
 const a=await f.chat({
   widget_token:"widget-A",name:"Test Klant",email:"customer@example.invalid",phone:"0470123456",
   contact_consent:true,message:"Ik wil een afspraak maken op 17/11/2026 om 14u00"
 });
 assert.equal(a.status,200,JSON.stringify(a.data));
 assert.equal(a.data.business_name,"Garage A");
 assert.ok(a.data.lead_id&&a.data.conversation_id&&a.data.appointment_id);
 assert.equal(f.data.leads.length,1);
 assert.equal(f.data.leads[0].email,"customer@example.invalid");
 assert.equal(f.data.leads[0].organization_id,A);
 assert.ok(f.data.leads[0].contact_consent_at);
 assert.equal(f.data.appointments[0].status,"requested");
 assert.equal(f.data.tasks.filter(x=>x.title==="Afspraakaanvraag opvolgen").length,1);
 assert.equal(f.data.messages.filter(x=>x.role==="customer").length,1);
 assert.equal(f.data.messages.filter(x=>x.role==="assistant").length,1);
 assert.equal(f.data.workflow_actions.length,0,"No outbound/calendar action from an unapproved request");

 const repeat=await f.chat({
   widget_token:"widget-A",lead_id:a.data.lead_id,conversation_id:a.data.conversation_id,
   message:"Ik wil dezelfde afspraak op 17/11/2026 om 14u00 boeken"
 });
 assert.equal(repeat.status,200);
 assert.equal(repeat.data.appointment_id,a.data.appointment_id,"Booking deduplication");
 assert.equal(f.data.appointments.length,1);
 assert.equal(f.data.tasks.length,1);

 const wrongOperator=await f.admin({action:"confirm_appointment",appointment_id:a.data.appointment_id},"operatorB");
 assert.equal(wrongOperator.status,404,"Another tenant must not approve appointment");

 const viewer=await f.admin({action:"confirm_appointment",appointment_id:a.data.appointment_id},"viewerA");
 assert.equal(viewer.status,403,"Non-administrator must not approve");

 const noTime=await f.admin({action:"confirm_appointment",appointment_id:a.data.appointment_id},"operatorA");
 // An explicit slot in this case is parsed from the public text, so confirm is a deliberate operator action.
 assert.equal(noTime.status,200,JSON.stringify(noTime.data));
 assert.equal(noTime.data.appointment.status,"confirmed");
 assert.equal(f.data.audit_events.filter(e=>e.event_type==="appointment.confirmed").length,1);
 assert.equal(f.data.workflow_actions.filter(a=>a.action_type==="calendar_request").length,1);
 assert.equal(f.data.workflow_actions[0].status,"pending");

 const repeatConfirm=await f.admin({action:"confirm_appointment",appointment_id:a.data.appointment_id},"operatorA");
 assert.equal(repeatConfirm.status,200);
 assert.equal(repeatConfirm.data.already_confirmed,true);
 assert.equal(f.data.workflow_actions.length,1,"Idempotent calendar sync");
 const approved={...f.data.appointments[0]};
 const more=await f.chat({
   widget_token:"widget-A",lead_id:a.data.lead_id,conversation_id:a.data.conversation_id,
   message:"Ik wil een nieuwe afspraak maken op 19/11/2026 om 15u00"
 });
 assert.equal(more.status,200,JSON.stringify(more.data));
 assert.notEqual(more.data.appointment_id,a.data.appointment_id);
 assert.equal(f.data.appointments.length,2);
 assert.equal(f.data.appointments[0].status,"confirmed");
 assert.equal(f.data.appointments[0].start_at,approved.start_at,"Confirmed slot immutable");
 assert.equal(f.data.appointments[1].status,"requested");

 const b=await f.chat({
   widget_token:"widget-B",name:"Test B",email:"b@example.invalid",
   contact_consent:true,message:"Ik wil een afspraak maken op 18/11/2026 om 10u00"
 },"https://beta.example.invalid");
 assert.equal(b.status,200,JSON.stringify(b.data));
 assert.equal(b.data.business_name,"Salon B");
 assert.equal(f.data.appointments.filter(a=>a.organization_id===B).length,1);
 assert.equal(f.data.leads.filter(l=>l.organization_id===A).length,1);
 assert.equal(f.data.leads.filter(l=>l.organization_id===B).length,1);
 const mix=await f.chat({
   widget_token:"widget-B",lead_id:a.data.lead_id,conversation_id:a.data.conversation_id,
   message:"Ik wil een afspraak boeken"
 },"https://beta.example.invalid");
 assert.equal(mix.status,404,"Public token from B cannot change conversation A");
 const banned=await f.chat({widget_token:"widget-A",message:"Ik wil boeken"},
  "https://beta.example.invalid");
 assert.equal(banned.status,403,"Origin allowlist isolates public widgets");
});

test("booking without contact channel asks for a contact method and remains unconfirmed",async()=>{
 const f=setup();
 const out=await f.chat({widget_token:"widget-A",message:"Ik wil een afspraak boeken"});
 assert.equal(out.status,200);
 assert.match(out.data.reply,/telefoonnummer of e-mailadres/i);
 assert.equal(out.data.contact.email,null);
 assert.equal(f.data.appointments[0].status,"requested");
 assert.equal(f.data.workflow_actions.length,0);
});

test("malformed status and unauthenticated operations never confirm",async()=>{
 const f=setup();
 const booked=await f.chat({widget_token:"widget-A",message:"Ik wil een afspraak boeken"});
 assert.equal(booked.status,200);
 const unauthorized=await f.admin({action:"confirm_appointment",appointment_id:booked.data.appointment_id},"fakeToken");
 assert.equal(unauthorized.status,401);
 const missingSlot=await f.admin({action:"confirm_appointment",appointment_id:booked.data.appointment_id},"operatorA");
 assert.equal(missingSlot.status,409);
 assert.equal(f.data.appointments[0].status,"requested");
 assert.equal(f.data.workflow_actions.length,0);
});

// Full isolated chain: real TypeScript HTTP handlers + genuine PostgreSQL trigger.
// A constrained pg-backed Supabase adapter simulates Auth and workflow RPC.
// Transport goes ONLY to an in-process fake Resend sink. Never live credentials.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {webcrypto} from "node:crypto";
import {isAppointmentRequest} from "../ai-receptionist-host/supabase/functions/public-reception-chat/intent.js";
import {VISITOR_EDITABLE_BOOKING_STATUSES,appointmentRequestReply} from "../ai-receptionist-host/supabase/functions/public-reception-chat/booking-guard.mjs";

if(process.env.RECEPTION_CI_ISOLATED!=="yes" ||
 !["localhost","127.0.0.1"].includes(process.env.PGHOST||"") ||
 process.env.PGDATABASE!=="postgres")throw Error("Only disposable localhost Postgres permitted");
const pool=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
 user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE});
const A="10000000-0000-4000-8000-000000000001",B="10000000-0000-4000-8000-000000000002";
const persons={
 ownerA:{id:"20000000-0000-4000-8000-000000000001",org:A,role:"owner"},
 ownerB:{id:"20000000-0000-4000-8000-000000000002",org:B,role:"owner"},
 viewerA:{id:"20000000-0000-4000-8000-000000000003",org:A,role:"viewer"}
};
const allowedTables=new Set(["organizations","business_profiles","memberships","leads","conversations",
 "messages","tasks","handoffs","appointments","workflow_actions","tenant_integrations",
 "audit_events","widget_rate_limits"]);
function col(v){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v))throw Error("Unsafe test SQL identifier");
 return '"'+v+'"';
}
class Query {
 constructor(table,person){
  if(!allowedTables.has(table))throw Error("Unexpected table: "+table);
  this.table=table;this.person=person;this.filters=[];this.selection=null;
  this.options={};this.sort=null;this.cap=null;this.mutation=null;
 }
 select(v="*",options={}){this.selection=v;this.options=options;return this;}
 eq(k,v){this.filters.push([k,"=",v]);return this;}
 gte(k,v){this.filters.push([k,">=",v]);return this;}
 in(k,v){this.filters.push([k,"ANY",v]);return this;}
 order(k,o={}){this.sort=[k,o.ascending!==false];return this;}
 limit(n){this.cap=n;return this;}
 insert(v){this.mutation=["insert",v];return this;}
 update(v){this.mutation=["update",v];return this;}
 async exec(){
  try{
   const vals=[],bind=(x)=>{vals.push(x);return "$"+vals.length;};
   const fs=this.filters.slice();
   if(this.person&&this.table==="memberships")fs.push(["user_id","=",this.person.id]);
   const pred=fs.map(([k,op,v])=>col(k)+(op==="ANY"?" = ANY("+bind(v)+")":" "+op+" "+bind(v)));
   const where=pred.length?" WHERE "+pred.join(" AND "):"";
   const select=this.selection||"*";
   if(select!=="*"&&!select.split(",").every(x=>/^[a-z_][a-z0-9_]*$/i.test(x.trim())))
    throw Error("Unexpected SELECT expression");
   let statement;
   if(this.mutation){
    const [kind,payload]=this.mutation,keys=Object.keys(payload);
    if(kind==="insert") statement="INSERT INTO public."+col(this.table)+" ("+
      keys.map(col).join(",")+") VALUES ("+keys.map(k=>bind(payload[k])).join(",")+
      ") RETURNING "+select;
    else statement="UPDATE public."+col(this.table)+" SET "+
      keys.map(k=>col(k)+"="+bind(payload[k])).join(",")+where+" RETURNING "+select;
   }else if(this.options.head)statement="SELECT count(*)::int AS total FROM public."+col(this.table)+where;
   else{
    statement="SELECT "+select+" FROM public."+col(this.table)+where;
    if(this.sort)statement+=" ORDER BY "+col(this.sort[0])+(this.sort[1]?" ASC":" DESC");
    if(this.cap!==null)statement+=" LIMIT "+bind(this.cap);
   }
   const r=await pool.query(statement,vals);
   return {data:this.options.head?null:((this.mutation&&!this.selection)?null:r.rows),
    count:this.options.head?r.rows[0]?.total:null,error:null};
  }catch(e){return {data:null,error:{message:e.message,code:e.code||"db_error"}};}
 }
 then(resolve,reject){return this.exec().then(resolve,reject);}
 async single(){const r=await this.exec();return {...r,data:r.data?.[0]||null,
  error:r.error||(r.data?.length===1?null:{message:"Expected one row"})};}
 async maybeSingle(){const r=await this.exec();return {...r,data:r.data?.[0]||null};}
}
function client(key,options={}){
 const principal=persons[String(options.global?.headers?.Authorization||"").replace(/^Bearer /,"")];
 if(key!=="service"&&key!=="anon")throw Error("Unsafe client key");
 return {
  from:t=>new Query(t,key==="anon"?(principal||{id:"00000000-0000-4000-8000-000000000000"}):null),
  auth:{getUser:async token=>persons[token]
    ?{data:{user:{id:persons[token].id}},error:null}
    :{data:{user:null},error:{message:"unauthorized"}}},
  async rpc(name,args={}){
   if(name==="consume_ai_daily_quota")return {data:true,error:null};
   if(name==="validate_workflow_runner_token")return {data:args.p_token==="isolated-only",error:null};
   if(name==="get_integration_credential")return {data:"mock-"+args.p_organization_id,error:null};
   if(name==="claim_workflow_actions"){
    const q="WITH picked AS (SELECT id FROM public.workflow_actions WHERE status='pending' "+
     "AND scheduled_at<=now() ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED) "+
     "UPDATE public.workflow_actions a SET status='processing',locked_by=$2,locked_at=now() "+
     "FROM picked p WHERE a.id=p.id RETURNING a.*";
    return {data:(await pool.query(q,[args.p_batch_size,args.p_worker_id])).rows,error:null};
   }
   if(name==="finish_workflow_action"){
    const q="UPDATE public.workflow_actions SET status=$1,provider=$2,provider_reference=$3,"+
     "http_status=$4,error_code=$5,last_error=$6,response_meta=$7,locked_at=NULL,locked_by=NULL "+
     "WHERE id=$8 RETURNING id";
    const r=await pool.query(q,[args.p_outcome,args.p_provider,args.p_provider_reference,
      args.p_http_status,args.p_error_code,args.p_error_message,args.p_response_meta||{},
      args.p_action_id]);
    return {data:r.rowCount===1,error:null};
   }
   throw Error("Unknown test RPC: "+name);
  }
 };
}
const sink=[];
function load(slug){
 const source=readFileSync("ai-receptionist-host/supabase/functions/"+slug+"/index.ts","utf8");
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,
  module:ts.ModuleKind.CommonJS}}).outputText;
 let handler;
 const ctx={
  exports:{},Date,Intl,URL,Request,Response,Headers,AbortController,
  TextEncoder,Uint8Array,crypto:webcrypto,setTimeout,clearTimeout,
  console:{error(){},log(){},warn(){}},
  Deno:{env:{get:k=>({
   SUPABASE_URL:"https://local.invalid",SUPABASE_ANON_KEY:"anon",
   SUPABASE_SERVICE_ROLE_KEY:"service",SUPABASE_SECRET_KEYS:'{"default":"service"}'
  })[k]},serve(fn){handler=fn;}},
  fetch:async (url,opts)=>{
   assert.equal(url,"https://api.resend.com/emails","Outside transport is prohibited");
   const msg=JSON.parse(opts.body);
   assert.equal(opts.method,"POST");
   assert.equal(msg.to.length,1);
   assert.ok(msg.to[0].endsWith("@example.test"),"No real recipients");
   assert.match(opts.headers["Idempotency-Key"],/^rai-email-[a-f0-9]{64}$/);
   sink.push({key:opts.headers["Idempotency-Key"],to:msg.to[0],
    auth:opts.headers.Authorization,subject:msg.subject});
   return Response.json({id:"sink-"+sink.length},{status:200});
  },
  require:x=>{
   if(x==="https://esm.sh/@supabase/supabase-js@2.95.0")return{createClient:(u,k,o)=>client(k,o)};
   if(x==="./intent.js")return{isAppointmentRequest};
   if(x==="./booking-guard.mjs")return{VISITOR_EDITABLE_BOOKING_STATUSES,appointmentRequestReply};
   throw Error("Unknown VM import: "+x);
  }
 };
 runInNewContext(js,ctx,{filename:slug+"/index.ts",timeout:3500});
 assert.equal(typeof handler,"function");return handler;
}
const chatHandler=load("public-reception-chat");
const operatorHandler=load("operations-admin");
const runnerHandler=load("workflow-runner");
async function post(handler,body,{origin="https://alpha.example.invalid",token,runner}={}){
 const headers={"Content-Type":"application/json","Origin":origin};
 if(token)headers.Authorization="Bearer "+token;
 if(runner)headers["x-runner-token"]=runner;
 const res=await handler(new Request("https://local.invalid/functions/v1/qa",{
  method:"POST",headers,body:JSON.stringify(body)
 }));
 return {status:res.status,body:await res.json()};
}
const chat=(body,origin)=>post(chatHandler,body,{origin});
const operator=(body,token)=>post(operatorHandler,body,{token});
const worker=(token="isolated-only")=>post(runnerHandler,{}, {runner:token});
async function get(table,org){
 const sql="SELECT * FROM public."+col(table)+(org?" WHERE organization_id=$1":"");
 return (await pool.query(sql,org?[org]:[])).rows;
}
function dateLabel(){
 const d=new Date(Date.now()+55*86400000),pad=v=>String(v).padStart(2,"0");
 return pad(d.getUTCDate())+"/"+pad(d.getUTCMonth()+1)+"/"+d.getUTCFullYear();
}
test("real PostgreSQL triggers + real HTTP handlers + synthetic provider for two tenants",async()=>{
 try{
  const date=dateLabel();
  await pool.query("INSERT INTO public.organizations(id,plan,trial_ends_at,status,is_internal) VALUES "+
   "($1,'trial',now()+interval '7 days','active',true),($2,'trial',now()+interval '7 days','active',true)",[A,B]);
  await pool.query("INSERT INTO public.business_profiles "+
   "(organization_id,automation_enabled,business_name,receptionist_name,widget_token,widget_enabled,widget_allowed_domains,locale,services,preferred_followup_channel) "+
   "VALUES ($1,true,'Garage A','Ava','widget-A',true,'[\"alpha.example.invalid\"]','nl-BE','[\"Auto\"]','email'),"+
   "($2,true,'Salon B','Berta','widget-B',true,'[\"beta.example.invalid\"]','nl-BE','[\"Styling\"]','email')",[A,B]);
  for(const x of Object.values(persons))
   await pool.query("INSERT INTO public.memberships(organization_id,user_id,role,active) VALUES ($1,$2,$3,true)",[x.org,x.id,x.role]);
  for(const org of [A,B])
   await pool.query("INSERT INTO public.tenant_integrations (organization_id,channel,provider,status,is_default,capabilities,config) "+
    "VALUES ($1,'email','resend','active',true,'[\"appointment_confirmation\"]','{\"sender_email\":\"from@example.test\"}')",[org]);

  const a=await chat({widget_token:"widget-A",name:"Synthetic A",email:"a@example.test",
   contact_consent:true,message:"Ik wil een afspraak maken op "+date+" om 14u00"});
  assert.equal(a.status,200,JSON.stringify(a.body));
  assert.ok(a.body.appointment_id);
  assert.equal((await get("leads",A)).length,1);
  assert.equal((await get("messages",A)).length,2);
  assert.equal((await get("tasks",A)).length,1);
  assert.equal((await get("appointments",A))[0].status,"requested");
  assert.equal((await get("workflow_actions",A)).length,0);
  assert.equal((await operator({action:"confirm_appointment",appointment_id:a.body.appointment_id},"ownerB")).status,404);
  assert.equal((await operator({action:"confirm_appointment",appointment_id:a.body.appointment_id},"viewerA")).status,403);
  assert.equal((await worker("wrong-token")).status,401);
  assert.equal((await worker()).body.claimed,0);
  assert.equal(sink.length,0);

  const approved=await operator({action:"confirm_appointment",appointment_id:a.body.appointment_id},"ownerA");
  assert.equal(approved.status,200,JSON.stringify(approved.body));
  assert.equal(approved.body.appointment.status,"confirmed");
  assert.equal((await get("audit_events",A)).filter(x=>x.event_type==="appointment.confirmed").length,1);
  assert.equal((await get("workflow_actions",A)).length,2);
  const first=await worker();
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(first.body.claimed,2);
  const actions=await get("workflow_actions",A);
  const confirmation=actions.find(x=>x.action_type==="appointment_confirmation");
  const calendar=actions.find(x=>x.action_type==="calendar_request");
  assert.equal(confirmation.status,"completed");
  assert.equal(confirmation.provider_reference,"sink-1");
  assert.equal(calendar.status,"blocked");
  assert.equal(calendar.error_code,"integration_missing");
  assert.equal(sink.length,1);
  assert.equal(sink[0].to,"a@example.test");
  assert.match(sink[0].subject,/Afspraak bevestigd/);
  assert.equal((await worker()).body.claimed,0);
  assert.equal(sink.length,1);

  const b=await chat({widget_token:"widget-B",name:"Synthetic B",email:"b@example.test",
    contact_consent:true,message:"Ik wil een afspraak maken op "+date+" om 10u00"},
    "https://beta.example.invalid");
  assert.equal(b.status,200,JSON.stringify(b.body));
  const cross=await chat({widget_token:"widget-B",lead_id:a.body.lead_id,
    conversation_id:a.body.conversation_id,message:"Graag boeken"},"https://beta.example.invalid");
  assert.equal(cross.status,404);
  assert.equal((await chat({widget_token:"widget-A",message:"Graag boeken"},
    "https://beta.example.invalid")).status,403);
  assert.equal((await operator({action:"confirm_appointment",appointment_id:b.body.appointment_id},"ownerB")).status,200);
  assert.equal((await worker()).body.claimed,2);
  assert.equal(sink.length,2);
  assert.equal(sink[1].to,"b@example.test");
  assert.notEqual(sink[0].key,sink[1].key);
  assert.notEqual(sink[0].auth,sink[1].auth);
  assert.equal((await get("workflow_actions",A)).length,2);

  const noConsent=await chat({widget_token:"widget-A",name:"No Consent",
    email:"blocked@example.test",message:"Ik wil een afspraak maken op "+date+" om 16u00"});
  assert.equal(noConsent.status,200);
  assert.equal((await operator({action:"confirm_appointment",appointment_id:noConsent.body.appointment_id},"ownerA")).status,200);
  assert.equal((await worker()).body.claimed,2);
  const failed=(await get("workflow_actions",A)).find(x=>x.action_type==="appointment_confirmation"&&
    x.payload?.appointment_id===noConsent.body.appointment_id);
  assert.equal(failed.status,"blocked");
  assert.equal(failed.error_code,"contact_consent_required");
  assert.equal(sink.length,2);

  const start=new Date(Date.now()+70*86400000);
  const changed=await operator({action:"schedule_appointment",appointment_id:a.body.appointment_id,
    status:"confirmed",start_at:start.toISOString(),
    end_at:new Date(start.getTime()+3600000).toISOString()},"ownerA");
  assert.equal(changed.status,200,JSON.stringify(changed.body));
  assert.equal((await worker()).body.claimed,2);
  assert.equal(sink.length,3);
  assert.match(sink[2].subject,/Afspraak bijgewerkt/);
  assert.notEqual(sink[0].key,sink[2].key);
  assert.equal((await worker()).body.claimed,0);
  assert.equal(sink.length,3);
 }finally{
  await pool.end();
 }
});

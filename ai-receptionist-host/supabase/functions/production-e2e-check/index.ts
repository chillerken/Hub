import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const cors={"access-control-allow-origin":"https://ai.luxwash.online","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","vary":"Origin"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store",...cors}});

async function commercialReadiness(req:Request, body:any) {
 const url=Deno.env.get("SUPABASE_URL")!;
 const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY")!;
 const service=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const db=createClient(url,service,{auth:{persistSession:false}});
 const runner=req.headers.get("x-runner-token")||"";
 const {data:valid,error:authError}=await db.rpc("validate_workflow_runner_token",{p_token:runner});
 if(authError||valid!==true)return json({error:"Unauthorized"},401);
 const id=crypto.randomUUID(),email="qa-commercial-"+id+"@example.invalid",password=crypto.randomUUID()+"Aa1!";
 const receipt:any={test_id:id,billing_payment_executed:false,external_messages_sent:false};
 let userId:string|null=null,orgId:string|null=null,cleanup=true,errorMessage="";
 const check=(ok:any,name:string)=>{receipt[name]=!!ok;if(!ok)throw new Error(name+" failed");};
 const checked=async(p:PromiseLike<any>)=>{const r=await p;if(r.error)throw r.error;return r.data;};
 try{
  const created=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{business_name:"QA Reception readiness "+id}});
  if(created.error)throw created.error;
  userId=created.data.user!.id;
  const owner=await checked(db.from("memberships").select("organization_id,role").eq("user_id",userId).eq("active",true).single());
  orgId=owner.organization_id;check(owner.role==="owner","new_tenant_created");
  const org=await checked(db.from("organizations").select("plan,is_internal,trial_ends_at").eq("id",orgId).single());
  check(org.is_internal===false&&org.plan==="trial"&&Date.parse(org.trial_ends_at)>Date.now(),"external_trial_created");
  const userDb=createClient(url,pub,{auth:{persistSession:false}});
  const signed=await userDb.auth.signInWithPassword({email,password});
  if(signed.error)throw signed.error;
  const access=signed.data.session!.access_token;
  check(!!access,"authentication_works");
  const visible=await checked(userDb.from("organizations").select("id"));
  check(visible.length===1&&visible[0].id===orgId,"tenant_read_isolation");
  const profile=await checked(userDb.from("business_profiles").update({
   description:"Technische verificatiegarage, geen echte klant. Wij onderhouden voertuigen.",
   services:["Onderhoud","Interieurreiniging"],widget_enabled:true,automation_enabled:false,
   widget_allowed_domains:["readiness.example.invalid"],notification_email:email
  }).eq("organization_id",orgId).select("widget_token").single());
  check(!!profile.widget_token,"profile_configuration_works");
  const call=async(slug:string,payload:any,authenticated=false,origin="https://readiness.example.invalid")=>{
   const r=await fetch(url+"/functions/v1/"+slug,{method:"POST",headers:{"content-type":"application/json","origin":origin,...(authenticated?{Authorization:"Bearer "+access,apikey:pub}:{})},body:JSON.stringify(payload)});
   return {status:r.status,data:await r.json().catch(()=>({}))};
  };
  const config=await call("public-widget-config",{widget_token:profile.widget_token});
  check(config.status===200&&config.data.active===true,"public_widget_configuration");
  const wrong=await call("public-widget-config",{widget_token:profile.widget_token},false,"https://unrelated.example.invalid");
  check(wrong.status===403,"widget_domain_restriction");
  const a=await call("public-reception-chat",{widget_token:profile.widget_token,email,contact_consent:false,message:"Welke diensten bieden jullie aan? Dit is een technische test."});
  check(a.status===200&&!!a.data.reply&&a.data.ai_status==="generated","real_ai_response");
  const ids={widget_token:profile.widget_token,lead_id:a.data.lead_id,conversation_id:a.data.conversation_id};
  const b=await call("public-reception-chat",{...ids,message:"Ik wil een afspraak aanvragen op maandag om 13 uur."});
  check(b.status===200&&!!b.data.appointment_id,"appointment_request_created");
  const c=await call("public-reception-chat",{...ids,message:"Ik wil die afspraak op maandag om 13 uur aanvragen."});
  check(c.status===200,"repeat_appointment_request_accepted");
  const d=await call("public-reception-chat",{...ids,message:"Ik wil met een medewerker spreken."});
  check(d.status===200&&!!d.data.reply,"human_handoff_response");
  const appointments=await checked(userDb.from("appointments").select("id,status").eq("lead_id",a.data.lead_id));
  check(appointments.length===1&&appointments[0].status!=="confirmed","appointment_deduped_without_invented_confirmation");
  const handoffs=await checked(userDb.from("handoffs").select("id").eq("lead_id",a.data.lead_id));
  check(handoffs.length===1,"handoff_recorded");
  const messages=await checked(userDb.from("messages").select("role").eq("conversation_id",a.data.conversation_id));
  check(messages.filter((x:any)=>x.role==="customer").length===4&&messages.filter((x:any)=>x.role==="assistant").length===4,"crm_conversation_persisted");
  const noConsent=await call("public-contact-capture",{...ids,name:"QA Contact",email,contact_consent:false});
  check(noConsent.status===409,"contact_consent_required");
  const billing=await call("billing-link",{plan:"starter"},true);
  check(billing.status===200&&/^https:\/\/buy\.stripe\.com\//.test(String(billing.data.checkout_url))&&billing.data.setup_cents===29900&&billing.data.monthly_cents===24900,"tenant_bound_checkout_prepared");
  await checked(db.from("organizations").update({trial_ends_at:new Date(Date.now()-3600000).toISOString()}).eq("id",orgId));
  const expired=await call("public-reception-chat",{...ids,message:"Dit is een verlopen pilot test."});
  check(expired.status===402,"expired_trial_chat_blocked");
  const expiredConfig=await call("public-widget-config",{widget_token:profile.widget_token});
  check(expiredConfig.status===402,"expired_trial_widget_blocked");
  await userDb.auth.signOut();
 }catch(e){errorMessage=String((e as any)?.message||e).slice(0,1000);}
 finally{
  if(orgId){
   const deletion=await db.from("organizations").delete().eq("id",orgId).eq("name","QA Reception readiness "+id);
   if(deletion.error)cleanup=false;
   const remaining=await db.from("organizations").select("id").eq("id",orgId);
   if(remaining.error||remaining.data?.length)cleanup=false;
  }
  if(userId){const deletion=await db.auth.admin.deleteUser(userId);if(deletion.error)cleanup=false;}
 }
 receipt.cleaned_up=cleanup;
 return json({ok:!errorMessage&&cleanup,receipt,...(errorMessage?{error:errorMessage}:{})},errorMessage||!cleanup?502:200);
}

Deno.serve(async(req:Request)=>{
 const routeBody=await req.clone().json().catch(()=>({}));
 if(routeBody.action==="commercial_readiness")return commercialReadiness(req,routeBody);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Method"},405);
 try{
  const auth=req.headers.get("authorization")||""; if(!auth.toLowerCase().startsWith("bearer "))return json({error:"Unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!, secrets=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}"),serviceKey=secrets.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userDb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}); const {data:{user},error:ue}=await userDb.auth.getUser(); if(ue||!user)return json({error:"Unauthorized"},401);
  const db=createClient(url,serviceKey,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({})); const widgetToken=String(body.widget_token||"").trim(); if(!widgetToken)return json({error:"widget_token required"},400);
  const {data:profile}=await db.from("business_profiles").select("organization_id").eq("widget_token",widgetToken).eq("widget_enabled",true).maybeSingle(); if(!profile)return json({error:"Widget not found"},404);
  const {data:membership}=await db.from("memberships").select("role").eq("user_id",user.id).eq("organization_id",profile.organization_id).eq("active",true).maybeSingle(); if(!membership||!["owner","admin"].includes(String(membership.role||"").toLowerCase()))return json({error:"Forbidden"},403);
  const testId="prod-e2e-"+crypto.randomUUID(),origin=String(body.origin||"https://www.luxwash.online"),chatUrl=url+"/functions/v1/public-reception-chat";
  const call=async(message:string,ids:any={})=>{const r=await fetch(chatUrl,{method:"POST",headers:{"content-type":"application/json","origin":origin},body:JSON.stringify({widget_token:widgetToken,message:"["+testId+"] "+message,...ids})}); const x=await r.json().catch(()=>({})); if(!r.ok)throw new Error("Production chat "+r.status+": "+(x?.error||"failed")); return x;};
  let leadId:string|null=null,conversationId:string|null=null,cleanupOk=true;
  try{
   const a=await call("Ik wil graag een afspraak aanvragen op maandag om 13 uur."); leadId=a.lead_id; conversationId=a.conversation_id; if(!leadId||!conversationId||!a.appointment_id)throw new Error("Appointment step incomplete");
   const b=await call("Ik wil die afspraak op maandag om 13 uur bevestigen als aanvraag.",{lead_id:leadId,conversation_id:conversationId});
   const c=await call("Ik wil ook graag met een medewerker spreken.",{lead_id:leadId,conversation_id:conversationId});
   const [{data:lead},{data:messages},{data:appointments},{data:handoffs},{data:tasks},{data:actions}]=await Promise.all([
    db.from("leads").select("id,status,score,qualification").eq("id",leadId).eq("organization_id",profile.organization_id).maybeSingle(),
    db.from("messages").select("role").eq("conversation_id",conversationId).eq("organization_id",profile.organization_id),
    db.from("appointments").select("id,status").eq("lead_id",leadId).eq("organization_id",profile.organization_id),
    db.from("handoffs").select("id,status").eq("lead_id",leadId).eq("organization_id",profile.organization_id),
    db.from("tasks").select("id,title,status").eq("lead_id",leadId).eq("organization_id",profile.organization_id),
    db.from("workflow_actions").select("id,action_type,status").eq("lead_id",leadId).eq("organization_id",profile.organization_id)
   ]);
   const appointmentCount=appointments?.length||0,handoffCount=handoffs?.length||0,followupCount=(tasks||[]).filter((t:any)=>t.title==="Afspraakaanvraag opvolgen").length;
   const customerCount=(messages||[]).filter((m:any)=>m.role==="customer").length,assistantCount=(messages||[]).filter((m:any)=>m.role==="assistant").length;
   const verified=!!lead&&appointmentCount===1&&followupCount===1&&handoffCount===1&&customerCount>=3&&assistantCount>=3&&!!a.reply&&!!b.reply&&!!c.reply;
   const receipt:any={appointment_created:appointmentCount===1,appointment_deduped:appointmentCount===1,followup_task_created:followupCount===1,handoff_created:handoffCount===1,customer_messages:customerCount,assistant_messages:assistantCount,ai_replies_present:!!a.reply&&!!b.reply&&!!c.reply,workflow_action_count:actions?.length||0};
   if(body.cleanup===true){
    for(const [table,col,val] of [["workflow_actions","lead_id",leadId],["tasks","lead_id",leadId],["handoffs","lead_id",leadId],["appointments","lead_id",leadId],["messages","conversation_id",conversationId],["conversations","id",conversationId],["leads","id",leadId]] as any[]){const {error}=await db.from(table).delete().eq(col,val).eq("organization_id",profile.organization_id); if(error)cleanupOk=false;}
   } else cleanupOk=false;
   receipt.cleaned_up=cleanupOk; return json({ok:verified&&cleanupOk,test_id:testId,receipt});
  }catch(e){ if(body.cleanup===true&&leadId){for(const [table,col,val] of [["workflow_actions","lead_id",leadId],["tasks","lead_id",leadId],["handoffs","lead_id",leadId],["appointments","lead_id",leadId],["messages","conversation_id",conversationId],["conversations","id",conversationId],["leads","id",leadId]] as any[]){if(val){const {error}=await db.from(table).delete().eq(col,val).eq("organization_id",profile.organization_id);if(error)cleanupOk=false;}}} return json({ok:false,test_id:testId,error:String((e as any)?.message||e),cleaned_up:cleanupOk},502);}
 }catch(e){return json({error:"Internal error",detail:String((e as any)?.message||e)},500)}
});

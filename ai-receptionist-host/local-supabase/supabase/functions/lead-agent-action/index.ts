import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return new Response(JSON.stringify({error:"method_not_allowed"}),{status:405,headers:cors});
  try{
    const auth=req.headers.get("Authorization")||"";
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:ue}=await userClient.auth.getUser();
    if(ue||!user) return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:cors});
    const {lead_id,action}=await req.json();
    if(!lead_id||action!=="follow_up") return new Response(JSON.stringify({error:"invalid_request"}),{status:400,headers:cors});
    const {data:mem,error:me}=await userClient.from("memberships").select("organization_id").eq("user_id",user.id).eq("active",true).single();
    if(me||!mem) return new Response(JSON.stringify({error:"membership_not_found"}),{status:403,headers:cors});
    const admin=createClient(url,service);
  const {data:org}=await admin.from("organizations").select("plan,subscription_status,trial_ends_at,is_internal").eq("id",mem.organization_id).single();
  const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
  const paidOk=["pro","business"].includes(org?.plan||"")&&["active","trialing"].includes(org?.subscription_status||"");
  if(!trialOk&&!paidOk)return new Response(JSON.stringify({error:"upgrade_required"}),{status:402,headers:cors});
    const {data:lead,error:le}=await admin.from("leads").select("id,name,email,phone,status,score,summary,contact_consent_at").eq("id",lead_id).eq("organization_id",mem.organization_id).single();
    if(le||!lead) return new Response(JSON.stringify({error:"lead_not_found"}),{status:404,headers:cors});

    const {data:config}=await admin.from("lead_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle();
    if(config?.active===true && Number(lead.score||0)<Number(config.min_score||60)){
      return new Response(JSON.stringify({
        ok:false,error:"below_score_threshold",lead_id:lead.id,
        score:Number(lead.score||0),min_score:Number(config.min_score||60)
      }),{status:409,headers:cors});
    }

    const {data:existing}=await admin.from("tasks").select("id").eq("organization_id",mem.organization_id).eq("lead_id",lead.id).eq("status","open").limit(1);
    let taskId=existing?.[0]?.id||null;
    if(!taskId){
      const minScore=Number(config?.min_score||60);
      const score=Number(lead.score||0);
      const priority=score>=Math.min(100,minScore+20)?"urgent":score>=minScore?"high":"normal";
      const dueHours=Math.max(1,Math.min(720,Number(config?.follow_up_due_hours||24)));
      const who=lead.name||lead.email||lead.phone||"prospect";
      const agentName=String(config?.name||"Lead Agent").slice(0,120);
      const {data:task,error:te}=await admin.from("tasks").insert({
        organization_id:mem.organization_id,lead_id:lead.id,
        title:`${agentName}: volg ${who} persoonlijk op`,
        status:"open",priority,due_at:new Date(Date.now()+dueHours*60*60*1000).toISOString()
      }).select("id").single();
      if(te) throw te; taskId=task.id;
    }
    const {error:up}=await admin.from("leads").update({status:"follow_up",updated_at:new Date().toISOString()}).eq("id",lead.id).eq("organization_id",mem.organization_id);
    if(up) throw up;

    let queuedActionId=null;
    if(config?.active===true && lead.contact_consent_at && (lead.email||lead.phone)){
      const preferred=String(config.preferred_channel||"auto");
      const workflowChannel=preferred==="email"||preferred==="whatsapp"?preferred:"auto";
      const key="lead:"+lead.id+":lead_agent_follow_up";
      const {data:wa,error:we}=await admin.from("workflow_actions").upsert({
        organization_id:mem.organization_id,
        lead_id:lead.id,
        action_type:"lead_follow_up",
        channel:workflowChannel,
        status:"pending",
        priority:(lead.score||0)>=80?"high":"normal",
        idempotency_key:key,
        payload:{
          source:"lead_agent",
          config_name:config.name,
          offer:config.offer,
          instructions:config.instructions
        },
        scheduled_at:new Date().toISOString()
      },{onConflict:"idempotency_key",ignoreDuplicates:true}).select("id").maybeSingle();
      if(!we) queuedActionId=wa?.id||null;
    }

    await admin.from("audit_events").insert({
      organization_id:mem.organization_id,actor_user_id:user.id,
      event_type:"lead_agent.follow_up_created",entity_type:"lead",entity_id:lead.id,
      payload:{
        task_id:taskId,score:lead.score,config_name:config?.name||null,
        min_score:config?.min_score||null,follow_up_due_hours:config?.follow_up_due_hours||24,
        preferred_channel:config?.preferred_channel||"auto",workflow_action_id:queuedActionId
      }
    });
    return new Response(JSON.stringify({
      ok:true,lead_id:lead.id,task_id:taskId,status:"follow_up",
      workflow_action_id:queuedActionId,config_active:config?.active===true
    }),{headers:cors});
  }catch(e){return new Response(JSON.stringify({error:"internal_error"}),{status:500,headers:cors});}
});
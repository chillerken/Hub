import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json"
};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return J({error:"unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const {data:{user},error:uerr}=await userDb.auth.getUser(auth.slice(7));
    if(uerr||!user)return J({error:"unauthorized"},401);

    const {data:activeContext}=await db.from("user_org_context").select("organization_id").eq("user_id",user.id).maybeSingle();
    let membershipQuery=userDb.from("memberships").select("organization_id,role").eq("user_id",user.id).eq("active",true);
    if(activeContext?.organization_id)membershipQuery=membershipQuery.eq("organization_id",activeContext.organization_id);
    const {data:mem,error:memError}=await membershipQuery.maybeSingle();
    if(memError||!mem)return J({error:memError?"organization_selection_required":"membership_not_found"},memError?409:403);

    const [{data:progress,error:perr},{data:activation,error:aerr},{data:pilotReport,error:pilotErr},{data:pilotValue,error:pilotValueErr}]=await Promise.all([
      db.rpc("compute_tenant_onboarding_progress",{p_organization_id:mem.organization_id}),
      db.rpc("compute_trial_activation_metrics",{p_organization_id:mem.organization_id}),
      db.rpc("compute_trial_value_report",{p_organization_id:mem.organization_id}),
      db.rpc("compute_pilot_value_metrics",{p_organization_id:mem.organization_id,p_period_days:14})
    ]);
    if(perr)throw perr;
    if(aerr)throw aerr;
    if(pilotErr)throw pilotErr;
    if(pilotValueErr)throw pilotValueErr;

    const now=new Date().toISOString();
    let activated=false;
    if(progress?.core_ready&&progress?.organization_status==="onboarding"){
      const {error:oe}=await db.from("organizations").update({status:"active",updated_at:now})
        .eq("id",mem.organization_id).eq("status","onboarding");
      if(oe)throw oe;
      activated=true;

      await db.from("audit_events").insert({
        organization_id:mem.organization_id,
        actor_user_id:user.id,
        event_type:"onboarding.core_completed",
        entity_type:"organization",
        entity_id:mem.organization_id,
        payload:{completed_steps:progress.completed_steps,total_steps:progress.total_steps}
      });
    }

    const {data:invite}=await db.from("sales_onboarding_invites")
      .select("id,lead_id,sales_organization_id,status,requested_plan,claimed_at")
      .eq("claimed_organization_id",mem.organization_id)
      .in("status",["claimed","converted"])
      .order("created_at",{ascending:false}).limit(1).maybeSingle();

    if(invite&&progress?.core_ready&&invite.status==="claimed"){
      const {data:salesLead}=await db.from("leads").select("qualification")
        .eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id).single();
      if(salesLead){
        await db.from("leads").update({
          qualification:{...(salesLead.qualification||{}),funnel_stage:"pilot_live",onboarding_core_completed_at:now},
          updated_at:now
        }).eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id);
      }

      const activationStage=String(activation?.stage||"not_started");
      const conversionReady=pilotValue?.conversion_ready===true;
      const salesStage=activationStage==="value_proven"?"value_proven":conversionReady?"conversion_ready":activationStage==="value_event"?"value_event":"pilot_live";
      const nextAction=activationStage==="value_proven"||conversionReady
        ?"De pilot toont voldoende echte waarde. Bespreek nu het passende betaalde plan en de productie-uitrol."
        :activationStage==="value_event"
          ?"Eerste echte waarde is zichtbaar. Volg persoonlijk op, verzamel feedback en stuur naar een tweede waarde-event."
          :"Volg de eerste echte resultaten tijdens de pilot op en stuur op betaalde activatie wanneer de waarde duidelijk is.";
      const reason=activationStage==="value_proven"
        ?"De tenant heeft meerdere echte waarde-events geregistreerd tijdens de pilot."
        :conversionReady
          ?"De pilot value score is "+String(pilotValue?.score||0)+"/100 en bevat voldoende gebruik plus commerciële intentie."
          :activationStage==="value_event"
            ?"De tenant heeft zijn eerste echte waarde-event geregistreerd tijdens de pilot."
            :"De prospect heeft de kernonboarding voltooid en Reception AI is klaar voor echte bezoekers.";

      await db.from("sales_opportunities").update({
        stage:salesStage,
        confidence:activationStage==="value_proven"?100:99,
        next_action:nextAction,
        reason,
        updated_at:now,analyzed_at:now
      }).eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id);

      const taskTitle=activation?.stage==="value_proven"||conversionReady
        ?"Sales Agent: conversion ready – bespreek betaald plan"
        :activation?.stage==="value_event"
          ?"Sales Agent: eerste waarde-event opvolgen"
          :"Sales Agent: pilotresultaten opvolgen";
      const {data:task}=await db.from("tasks").select("id")
        .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
        .eq("status","open").eq("title",taskTitle).limit(1);
      if(!task?.length){
        await db.from("tasks").insert({
          organization_id:invite.sales_organization_id,
          lead_id:invite.lead_id,
          title:taskTitle,
          status:"open",priority:(activation?.stage==="value_proven"||conversionReady)?"urgent":"high",
          due_at:new Date(Date.now()+((activation?.stage==="value_proven"||conversionReady)?12:activation?.stage==="value_event"?24:72)*3600000).toISOString()
        });
      }

      await db.from("audit_events").insert({
        organization_id:invite.sales_organization_id,
        actor_user_id:null,
        event_type:"sales_onboarding.pilot_live",
        entity_type:"lead",
        entity_id:invite.lead_id,
        payload:{invite_id:invite.id,claimed_organization_id:mem.organization_id,requested_plan:invite.requested_plan}
      });
    }

    const [{data:fresh},{data:freshActivation},{data:freshPilotReport},{data:freshPilotValue}]=await Promise.all([
      db.rpc("compute_tenant_onboarding_progress",{p_organization_id:mem.organization_id}),
      db.rpc("compute_trial_activation_metrics",{p_organization_id:mem.organization_id}),
      db.rpc("compute_trial_value_report",{p_organization_id:mem.organization_id}),
      db.rpc("compute_pilot_value_metrics",{p_organization_id:mem.organization_id,p_period_days:14})
    ]);
    return J({
      ok:true,
      progress:fresh||progress,
      activation:freshActivation||activation,
      pilot_report:freshPilotReport||pilotReport,
      pilot_value:freshPilotValue||pilotValue,
      activated
    });
  }catch(e){
    console.error("ONBOARDING_STATUS",e);
    return J({error:"onboarding_status_failed"},500);
  }
});
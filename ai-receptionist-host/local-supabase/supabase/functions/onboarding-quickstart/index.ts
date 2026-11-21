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

    const {data:mem}=await userDb.from("memberships").select("organization_id,role")
      .eq("user_id",user.id).eq("active",true).single();
    if(!mem||!["owner","admin"].includes(String(mem.role||"")))return J({error:"forbidden"},403);

    const {data:profile,error:perr}=await db.from("business_profiles").select("*")
      .eq("organization_id",mem.organization_id).single();
    if(perr||!profile)return J({error:"profile_not_found"},404);

    const now=new Date().toISOString();
    const updates:any={
      widget_enabled:true,
      automation_enabled:true,
      updated_at:now
    };
    if(!String(profile.notification_email||"").trim()&&user.email)updates.notification_email=String(user.email).trim().toLowerCase();
    if(!["progressive","high_intent","off"].includes(String(profile.lead_capture_mode||"")))updates.lead_capture_mode="progressive";

    const {data:updated,error:updateErr}=await db.from("business_profiles").update(updates)
      .eq("organization_id",mem.organization_id).select("*").single();
    if(updateErr)throw updateErr;

    await db.from("audit_events").insert({
      organization_id:mem.organization_id,
      actor_user_id:user.id,
      event_type:"onboarding.quick_start",
      entity_type:"organization",
      entity_id:mem.organization_id,
      payload:{
        widget_enabled:true,
        automation_enabled:true,
        notification_email_set:Boolean(updates.notification_email),
        lead_capture_mode:updated.lead_capture_mode
      }
    });

    const {data:progress,error:progressErr}=await db.rpc("compute_tenant_onboarding_progress",{p_organization_id:mem.organization_id});
    if(progressErr)throw progressErr;

    return J({
      ok:true,
      progress,
      changed:{
        widget_enabled:true,
        automation_enabled:true,
        notification_email:updated.notification_email||null,
        lead_capture_mode:updated.lead_capture_mode||"progressive"
      }
    });
  }catch(e){
    console.error("ONBOARDING_QUICKSTART",e);
    return J({error:"quick_start_failed"},500);
  }
});
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json"
};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return J({error:"unauthorized"},401);

    const b=await req.json().catch(()=>({}));
    const token=clean(b.token,80);
    if(!/^[0-9a-f-]{36}$/i.test(token))return J({error:"invalid_onboarding_link"},400);

    const url=Deno.env.get("SUPABASE_URL")!;
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const {data:{user},error:uerr}=await userDb.auth.getUser(auth.slice(7));
    if(uerr||!user)return J({error:"unauthorized"},401);
    const {data:mem}=await userDb.from("memberships").select("organization_id,role").eq("user_id",user.id).eq("active",true).single();
    if(!mem||!["owner","admin"].includes(String(mem.role||"")))return J({error:"forbidden"},403);

    const {data:invite}=await db.from("sales_onboarding_invites")
      .select("*").eq("token",token).maybeSingle();
    if(!invite)return J({error:"onboarding_link_not_found"},404);
    if(new Date(invite.expires_at).getTime()<=Date.now())return J({error:"onboarding_link_expired"},410);
    if(invite.claimed_organization_id&&invite.claimed_organization_id!==mem.organization_id)return J({error:"onboarding_link_already_claimed"},409);
    if(["converted","cancelled","expired"].includes(String(invite.status||"")))return J({error:"onboarding_link_closed"},409);

    const {data:lead}=await db.from("leads").select("id,email,phone,qualification,status")
      .eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id).single();
    if(!lead)return J({error:"lead_not_found"},404);

    const prospectEmail=String(lead.email||"").trim().toLowerCase();
    const accountEmail=String(user.email||"").trim().toLowerCase();
    if(prospectEmail && prospectEmail!==accountEmail){
      return J({error:"onboarding_account_email_mismatch"},403);
    }

    const now=new Date().toISOString();
    if(invite.claimed_organization_id===mem.organization_id && invite.status==="claimed"){
      return J({ok:true,requested_plan:invite.requested_plan,organization_id:mem.organization_id,already_claimed:true});
    }

    const {data:claimed,error:claimError}=await db.from("sales_onboarding_invites").update({
      status:"claimed",
      claimed_organization_id:mem.organization_id,
      claimed_at:invite.claimed_at||now,
      updated_at:now
    })
      .eq("id",invite.id)
      .eq("status","pending")
      .is("claimed_organization_id",null)
      .select("id,claimed_organization_id,status")
      .maybeSingle();

    if(claimError)throw claimError;
    if(!claimed){
      const {data:latest}=await db.from("sales_onboarding_invites")
        .select("status,claimed_organization_id")
        .eq("id",invite.id)
        .maybeSingle();
      if(latest?.claimed_organization_id===mem.organization_id && latest?.status==="claimed"){
        return J({ok:true,requested_plan:invite.requested_plan,organization_id:mem.organization_id,already_claimed:true});
      }
      return J({error:"onboarding_link_already_claimed"},409);
    }

    await db.from("leads").update({
      status:["won","lost"].includes(String(lead.status||""))?lead.status:"follow_up",
      score:95,
      qualification:{...(lead.qualification||{}),funnel_stage:"onboarding_started",requested_plan:invite.requested_plan,onboarding_invite_id:invite.id,tenant_organization_id:mem.organization_id},
      updated_at:now
    }).eq("id",lead.id).eq("organization_id",invite.sales_organization_id);

    await db.from("sales_opportunities").upsert({
      organization_id:invite.sales_organization_id,lead_id:lead.id,temperature:"hot",stage:"onboarding",confidence:98,
      next_action:"Onboarding begeleiden en controleren of bedrijfsprofiel, widget en integraties correct worden ingesteld.",
      reason:"De prospect heeft een Reception AI-bedrijfsaccount aan de salesflow gekoppeld.",
      channel:lead.phone?"telefoon":lead.email?"e-mail":"CRM",
      message:"",objection:"",missing_info:[],can_contact:true,analyzed_at:now,updated_at:now
    },{onConflict:"organization_id,lead_id"});

    const {data:task}=await db.from("tasks").select("id").eq("organization_id",invite.sales_organization_id)
      .eq("lead_id",lead.id).eq("status","open").eq("title","Sales Agent: Reception AI onboarding begeleiden").limit(1);
    if(!task?.length){
      await db.from("tasks").insert({
        organization_id:invite.sales_organization_id,lead_id:lead.id,
        title:"Sales Agent: Reception AI onboarding begeleiden",status:"open",priority:"high",
        due_at:new Date(Date.now()+24*3600000).toISOString()
      });
    }

    await db.from("audit_events").insert({
      organization_id:invite.sales_organization_id,actor_user_id:null,event_type:"sales_onboarding.claimed",
      entity_type:"lead",entity_id:lead.id,
      payload:{invite_id:invite.id,claimed_organization_id:mem.organization_id,requested_plan:invite.requested_plan}
    });

    return J({ok:true,requested_plan:invite.requested_plan,organization_id:mem.organization_id});
  }catch(e){
    console.error("CLAIM_SALES_ONBOARDING",e);
    return J({error:"claim_onboarding_failed"},500);
  }
});
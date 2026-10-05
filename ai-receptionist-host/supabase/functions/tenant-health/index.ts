import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const out=(body:any,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json"}
});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return out({error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return out({error:"Unauthorized"},401);
    const token=auth.slice(7);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,anon,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
    const db=createClient(url,service,{auth:{persistSession:false}});

    const {data:u,error:ue}=await userDb.auth.getUser(token);
    if(ue||!u?.user) return out({error:"Unauthorized"},401);

    const {data:mem,error:me}=await userDb.from("memberships")
      .select("organization_id,role")
      .eq("user_id",u.user.id).eq("active",true).single();
    if(me||!mem) return out({error:"Membership not found"},403);
    if(!["owner","admin"].includes(mem.role)) return out({error:"Owner or admin role required"},403);
    const org=mem.organization_id;

    const [{data:organization},{data:profile},{data:integrations},{count:blocked},{count:failed},{count:pending},{count:handoffs}]=await Promise.all([
      db.from("organizations").select("id,name,status,plan,subscription_status,trial_ends_at,stripe_customer_id,stripe_subscription_id").eq("id",org).single(),
      db.from("business_profiles").select("business_name,description,services,qualification_questions,notification_email,automation_enabled,widget_enabled,preferred_followup_channel").eq("organization_id",org).single(),
      db.from("tenant_integrations").select("channel,provider,status,last_verified_at,last_error,config").eq("organization_id",org).eq("is_default",true),
      db.from("workflow_actions").select("id",{count:"exact",head:true}).eq("organization_id",org).eq("status","blocked"),
      db.from("workflow_actions").select("id",{count:"exact",head:true}).eq("organization_id",org).eq("status","failed"),
      db.from("workflow_actions").select("id",{count:"exact",head:true}).eq("organization_id",org).eq("status","pending"),
      db.from("handoffs").select("id",{count:"exact",head:true}).eq("organization_id",org).eq("status","open")
    ]);

    const by=(channel:string)=>(integrations||[]).find((x:any)=>x.channel===channel);
    const profileReady=!!(
      profile?.business_name &&
      String(profile?.description||"").trim() &&
      Array.isArray(profile?.services) && profile.services.length &&
      Array.isArray(profile?.qualification_questions) && profile.qualification_questions.length &&
      profile?.notification_email &&
      profile?.automation_enabled===true &&
      profile?.widget_enabled===true
    );
    const emailReady=by("email")?.status==="active";
    const whatsappReady=by("whatsapp")?.status==="active";
    const outboundReady=emailReady||whatsappReady;
    const calendarReady=by("calendar")?.status==="active";
    const paymentReady=by("payment")?.status==="active";
    const coreReady=profileReady&&outboundReady;
    const fullReady=coreReady&&calendarReady&&paymentReady;
    const billingReady=organization?.plan==="trial"
      ? new Date(organization?.trial_ends_at||0).getTime()>Date.now()
      : ["active","trialing"].includes(String(organization?.subscription_status||""));

    const blockers:any[]=[];
    if(!profileReady) blockers.push({code:"profile_incomplete",area:"profile"});
    if(!outboundReady) blockers.push({code:"outbound_integration_missing",area:"outbound"});
    if(!calendarReady) blockers.push({code:"calendar_integration_missing",area:"calendar"});
    if(!paymentReady) blockers.push({code:"payment_integration_missing",area:"payment"});
    if(!billingReady) blockers.push({code:"saas_billing_inactive",area:"billing"});
    if((failed||0)>0) blockers.push({code:"workflow_failed",area:"workflow",count:failed});
    if((blocked||0)>0) blockers.push({code:"workflow_blocked",area:"workflow",count:blocked});

    return out({
      ok:true,
      readiness:{
        status:fullReady&&billingReady&&!(failed||0)?"ready":coreReady&&billingReady?"core_ready":"setup",
        profile:profileReady,
        outbound:outboundReady,
        email:emailReady,
        whatsapp:whatsappReady,
        calendar:calendarReady,
        payment:paymentReady,
        saas_billing:billingReady,
        full:fullReady&&billingReady&&!(failed||0)
      },
      organization:{
        status:organization?.status,
        plan:organization?.plan,
        subscription_status:organization?.subscription_status,
        trial_ends_at:organization?.trial_ends_at,
        has_stripe_customer:!!organization?.stripe_customer_id,
        has_stripe_subscription:!!organization?.stripe_subscription_id
      },
      integrations:(integrations||[]).map((x:any)=>({
        channel:x.channel,
        provider:x.provider,
        status:x.status,
        last_verified_at:x.last_verified_at,
        last_error:x.last_error||null
      })),
      workflow:{
        pending:pending||0,
        blocked:blocked||0,
        failed:failed||0,
        open_handoffs:handoffs||0
      },
      blockers
    });
  }catch(e){
    console.error(e);
    return out({error:"Health check failed"},500);
  }
});
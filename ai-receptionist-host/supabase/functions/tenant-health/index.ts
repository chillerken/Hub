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
      db.from("tenant_integrations").select("channel,provider,status,last_verified_at,last_error,config,capabilities").eq("organization_id",org).eq("is_default",true),
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
    const email=by("email");
    const whatsapp=by("whatsapp");
    const calendar=by("calendar");
    const payment=by("payment");
    const emailReady=email?.status==="active";
    const whatsappReady=whatsapp?.status==="active";
    const calendarReady=calendar?.status==="active";
    const paymentConnected=payment?.status==="active";
    const paymentReady=paymentConnected&&payment?.config?.stripe_mode==="live";
    const emailCaps=Array.isArray(email?.capabilities)?email.capabilities:[];
    const waCaps=Array.isArray(whatsapp?.capabilities)?whatsapp.capabilities:[];

    const emailCan=(type:string)=>!!(
      emailReady &&
      emailCaps.includes(type) &&
      (type!=="review_request"||String(email?.config?.review_url||"").trim())
    );
    const whatsappCan=(type:string)=>{
      const template=whatsapp?.config?.templates?.[type];
      const vars=Array.isArray(template?.variables)?template.variables:[];
      return !!(
        whatsappReady &&
        waCaps.includes(type) &&
        template?.name &&
        template?.language &&
        String(whatsapp?.config?.phone_number_id||"").trim() &&
        /^v\d+\.\d+$/.test(String(whatsapp?.config?.api_version||"").trim()) &&
        (type!=="review_request"||String(whatsapp?.config?.review_url||"").trim()) &&
        (type!=="payment_link_send"||vars.includes("payment_url"))
      );
    };
    const actionReady=(type:string)=>emailCan(type)||whatsappCan(type);
    const lifecycle={
      lead_follow_up:actionReady("lead_follow_up"),
      appointment_confirmation:actionReady("appointment_confirmation"),
      payment_link_send:actionReady("payment_link_send"),
      review_request:actionReady("review_request"),
      retention_follow_up:actionReady("retention_follow_up")
    };
    const lifecycleReady=Object.values(lifecycle).every(Boolean);
    const ownerNotificationReady=emailReady&&emailCaps.includes("notify_owner");
    const outboundReady=lifecycle.lead_follow_up;
    const coreReady=profileReady&&ownerNotificationReady&&outboundReady;
    const fullReady=coreReady&&calendarReady&&paymentReady&&lifecycleReady;
    const billingReady=organization?.plan==="trial"
      ? new Date(organization?.trial_ends_at||0).getTime()>Date.now()
      : ["active","trialing"].includes(String(organization?.subscription_status||""));

    const blockers:any[]=[];
    if(!profileReady) blockers.push({code:"profile_incomplete",area:"profile"});
    if(!ownerNotificationReady) blockers.push({code:"owner_notification_unavailable",area:"email"});
    if(!outboundReady) blockers.push({code:"lead_followup_channel_unavailable",area:"outbound"});
    if(!lifecycle.appointment_confirmation) blockers.push({code:"appointment_confirmation_unavailable",area:"outbound"});
    if(!lifecycle.payment_link_send) blockers.push({code:"payment_link_delivery_unavailable",area:"outbound"});
    if(!lifecycle.review_request) blockers.push({code:"review_delivery_unavailable",area:"review"});
    if(!lifecycle.retention_follow_up) blockers.push({code:"retention_delivery_unavailable",area:"retention"});
    if(!calendarReady) blockers.push({code:"calendar_integration_missing",area:"calendar"});
    if(!paymentConnected) blockers.push({code:"payment_integration_missing",area:"payment"});
    else if(payment?.config?.stripe_mode!=="live") blockers.push({code:"stripe_test_mode",area:"payment"});
    if(!billingReady) blockers.push({code:"saas_billing_inactive",area:"billing"});
    if((failed||0)>0) blockers.push({code:"workflow_failed",area:"workflow",count:failed});
    if((blocked||0)>0) blockers.push({code:"workflow_blocked",area:"workflow",count:blocked});

    return out({
      ok:true,
      readiness:{
        status:fullReady&&billingReady&&!(failed||0)?"ready":coreReady&&billingReady?"core_ready":"setup",
        profile:profileReady,
        outbound:outboundReady,
        owner_notification:ownerNotificationReady,
        email:emailReady,
        whatsapp:whatsappReady,
        calendar:calendarReady,
        payment:paymentReady,
        payment_connected:paymentConnected,
        stripe_mode:payment?.config?.stripe_mode||null,
        lifecycle,
        lifecycle_ready:lifecycleReady,
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
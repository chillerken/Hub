import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};

const json=(data:any,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}
});

const text=(v:any,max:number)=>String(v??"").trim().slice(0,max);
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hexRe=/^#[0-9a-f]{6}$/i;
const normalizeDomains=(v:any)=>{
  const raw=Array.isArray(v)?v:String(v??"").split(/[\n,]+/);
  const out:string[]=[];
  for(const item of raw){
    const s=String(item||"").trim().toLowerCase();
    if(!s)continue;
    let host=s.replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/^www\./,"");
    if(!/^[a-z0-9.-]+$/.test(host)||!host.includes("."))continue;
    if(!out.includes(host))out.push(host);
    if(out.length>=20)break;
  }
  return out;
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method"},405);

  try{
    const auth=req.headers.get("authorization")||"";
    const jwt=auth.replace(/^Bearer\s+/i,"").trim();
    if(!jwt) return json({error:"Niet aangemeld"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const {data:userData,error:userError}=await db.auth.getUser(jwt);
    const user=userData?.user;
    if(userError||!user) return json({error:"Sessie ongeldig"},401);

    const {data:admin}=await db.from("platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
    if(!admin) return json({error:"Geen platformbeheerrechten"},403);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"list_clients");

    if(action==="status") return json({platform_admin:true});

    if(action==="google_oauth_status"){
      const [{data:clientId},{data:clientSecret},{data:appUrl}]=await Promise.all([
        db.rpc("get_platform_secret",{p_name:"reception_ai_google_client_id"}),
        db.rpc("get_platform_secret",{p_name:"reception_ai_google_client_secret"}),
        db.rpc("get_platform_secret",{p_name:"reception_ai_app_url"})
      ]);
      return json({
        configured:Boolean(clientId&&clientSecret),
        client_id:String(clientId||""),
        has_client_secret:Boolean(clientSecret),
        app_url:String(appUrl||"https://reception-ai-luxwash.vercel.app"),
        redirect_uri:url+"/functions/v1/google-calendar-oauth-callback"
      });
    }

    if(action==="configure_google_oauth"){
      const clientId=text(body.client_id,500);
      const clientSecret=text(body.client_secret,1200);
      if(!clientId||!clientId.endsWith(".apps.googleusercontent.com")){
        return json({error:"Ongeldige Google OAuth Client ID. Gebruik de Web application Client ID die eindigt op .apps.googleusercontent.com."},400);
      }
      const {data:existingSecret}=await db.rpc("get_platform_secret",{p_name:"reception_ai_google_client_secret"});
      if(!clientSecret&&!existingSecret){
        return json({error:"Google OAuth Client Secret is verplicht bij de eerste configuratie."},400);
      }
      const writes=[
        db.rpc("set_platform_secret",{p_name:"reception_ai_google_client_id",p_value:clientId}),
        db.rpc("set_platform_secret",{p_name:"reception_ai_app_url",p_value:"https://reception-ai-luxwash.vercel.app"})
      ];
      if(clientSecret) writes.push(db.rpc("set_platform_secret",{p_name:"reception_ai_google_client_secret",p_value:clientSecret}));
      const results=await Promise.all(writes);
      const failure=results.find((x:any)=>x.error);
      if(failure?.error) throw failure.error;

      await db.from("audit_events").insert({
        organization_id:(await db.from("memberships").select("organization_id").eq("user_id",user.id).eq("active",true).limit(1).maybeSingle()).data?.organization_id,
        actor_user_id:user.id,
        event_type:"platform.google_oauth_configured",
        entity_type:"platform_configuration",
        payload:{client_id_suffix:clientId.slice(-40),client_secret_updated:Boolean(clientSecret)}
      });

      return json({
        ok:true,
        configured:true,
        client_id:clientId,
        has_client_secret:true,
        app_url:"https://reception-ai-luxwash.vercel.app",
        redirect_uri:url+"/functions/v1/google-calendar-oauth-callback"
      });
    }

    if(action==="list_clients"){
      const [{data:orgs,error:oe},{data:profiles,error:pe},{data:leadRows,error:le},{data:convRows,error:ce},{data:apptRows,error:ae},{data:integrationRows,error:ie},{data:activationRows,error:xe},{data:inviteRows,error:ve}]=await Promise.all([
        db.from("organizations").select("id,name,status,plan,subscription_status,trial_ends_at,is_internal,created_at,updated_at").order("created_at",{ascending:false}).limit(250),
        db.from("business_profiles").select("organization_id,business_name,description,services,receptionist_name,widget_token,widget_enabled,widget_greeting,widget_accent,widget_allowed_domains,notification_email,automation_enabled,lead_capture_mode,updated_at"),
        db.from("leads").select("organization_id,score,created_at"),
        db.from("conversations").select("organization_id,channel,created_at"),
        db.from("appointments").select("organization_id,status"),
        db.from("tenant_integrations").select("organization_id,channel,status,is_default,capabilities").eq("is_default",true),
        db.from("tenant_activation_events").select("organization_id,event_type,happened_at"),
        db.from("sales_onboarding_invites").select("claimed_organization_id,status,requested_plan,claimed_at,converted_at").not("claimed_organization_id","is",null).order("created_at",{ascending:false})
      ]);
      if(oe||pe||le||ce||ae||ie||xe||ve) throw oe||pe||le||ce||ae||ie||xe||ve;

      const count=(rows:any[]|null,key:string,value:string,filter?:(x:any)=>boolean)=>(rows||[]).reduce((n,x)=>n+(x?.[key]===value&&(!filter||filter(x))?1:0),0);
      const byOrg=new Map((profiles||[]).map((p:any)=>[p.organization_id,p]));
      const integrationsByOrg=new Map<string,any[]>();
      for(const x of integrationRows||[]){const a=integrationsByOrg.get(x.organization_id)||[];a.push(x);integrationsByOrg.set(x.organization_id,a)}
      const activationByOrg=new Map<string,Set<string>>();
      for(const x of activationRows||[]){const s=activationByOrg.get(x.organization_id)||new Set<string>();s.add(x.event_type);activationByOrg.set(x.organization_id,s)}
      const inviteByOrg=new Map<string,any>();
      for(const x of inviteRows||[])if(x.claimed_organization_id&&!inviteByOrg.has(x.claimed_organization_id))inviteByOrg.set(x.claimed_organization_id,x);

      return json({clients:(orgs||[]).map((o:any)=>{
        const p:any=byOrg.get(o.id)||{};
        const orgInts=integrationsByOrg.get(o.id)||[];
        const events=activationByOrg.get(o.id)||new Set<string>();
        const profileReady=Boolean(String(p.business_name||"").trim()&&String(p.description||"").trim().length>=10&&Array.isArray(p.services)&&p.services.length);
        const tested=count(convRows,"organization_id",o.id)>0;
        const widget=Boolean(p.widget_enabled);
        const notify=Boolean(String(p.notification_email||"").trim());
        const automation=Boolean(p.automation_enabled);
        const outbound=orgInts.some((x:any)=>x.status==="active"&&["email","whatsapp"].includes(x.channel)&&Array.isArray(x.capabilities)&&x.capabilities.includes("lead_follow_up"));
        const onboardingCompleted=[profileReady,tested,widget,notify,outbound,automation].filter(Boolean).length;
        const activationScore=(events.has("first_public_conversation")?15:0)+(events.has("first_qualified_lead")?35:0)+(events.has("first_handoff")?20:0)+(events.has("first_appointment_request")?20:0)+(events.has("first_confirmed_appointment")?5:0)+(events.has("first_customer_payment")?5:0);
        const valueCount=["first_qualified_lead","first_handoff","first_appointment_request","first_customer_payment"].filter(x=>events.has(x)).length;
        const activationStage=valueCount>=2?"value_proven":valueCount===1?"value_event":events.has("first_public_conversation")?"usage_started":"not_started";
        const invite=inviteByOrg.get(o.id)||null;
        const healthSince=Date.now()-14*24*3600000;
        const recentConversations=(convRows||[]).filter((x:any)=>x.organization_id===o.id&&new Date(x.created_at).getTime()>=healthSince&&["web","web_chat","widget"].includes(String(x.channel||""))).length;
        const recentLeads=(leadRows||[]).filter((x:any)=>x.organization_id===o.id&&new Date(x.created_at).getTime()>=healthSince).length;
        const recentWarmLeads=(leadRows||[]).filter((x:any)=>x.organization_id===o.id&&new Date(x.created_at).getTime()>=healthSince&&Number(x.score||0)>=60).length;
        const paidSince=invite?.converted_at?new Date(invite.converted_at).getTime():0;
        const customerAgeDays=paidSince?Math.max(0,(Date.now()-paidSince)/86400000):0;
        const paymentOk=o.subscription_status==="active";
        let customerHealthScore=(paymentOk?25:0)+(widget?20:0)+(automation?15:0)+(outbound?15:0)+(recentConversations>0?15:0)+(recentLeads>0?10:0);
        const customerRisks:string[]=[];
        if(["past_due","unpaid","canceled","incomplete_expired"].includes(String(o.subscription_status||""))){customerHealthScore=Math.min(customerHealthScore,35);customerRisks.push("payment_risk")}
        if(!widget)customerRisks.push("widget_off");
        if(!automation)customerRisks.push("automation_off");
        if(!outbound)customerRisks.push("no_followup_channel");
        if(customerAgeDays>=7&&recentConversations===0)customerRisks.push("no_recent_usage");
        if(customerAgeDays>=14&&recentLeads===0)customerRisks.push("no_recent_leads");
        const isPaidCustomer=invite?.status==="converted"||o.subscription_status==="active";
        const customerHealthStatus=!isPaidCustomer?null:
          ["past_due","unpaid","canceled","incomplete_expired"].includes(String(o.subscription_status||""))?"critical":
          customerAgeDays<7&&recentConversations===0?"launching":
          customerHealthScore>=80?"healthy":customerHealthScore>=55?"attention":"critical";
        const customerHealthNext=customerHealthStatus==="critical"&&customerRisks.includes("payment_risk")
          ?"Controleer betaling en neem persoonlijk contact op."
          :customerRisks.includes("widget_off")
            ?"Controleer of de websitewidget actief en correct geplaatst is."
            :customerRisks.includes("no_followup_channel")
              ?"Koppel een opvolgkanaal voor warme leads."
              :customerRisks.includes("automation_off")
                ?"Controleer of de automatische workflow geactiveerd moet worden."
                :customerRisks.includes("no_recent_usage")
                  ?"Controleer widgetplaatsing en websiteverkeer."
                  :"Geen directe klantgezondheidsactie nodig.";
        return {
          organization_id:o.id,
          organization_name:o.name,
          organization_status:o.status,
          is_internal:o.is_internal===true,
          plan:o.plan,
          subscription_status:o.subscription_status,
          trial_ends_at:o.trial_ends_at,
          created_at:o.created_at,
          updated_at:o.updated_at,
          business_name:p.business_name||o.name,
          receptionist_name:p.receptionist_name||"AI Assistent",
          widget_token:p.widget_token||null,
          widget_enabled:p.widget_enabled!==false,
          widget_greeting:p.widget_greeting||"",
          widget_accent:p.widget_accent||"#6d5dfc",
          widget_allowed_domains:Array.isArray(p.widget_allowed_domains)?p.widget_allowed_domains:[],
          notification_email:p.notification_email||"",
          automation_enabled:p.automation_enabled===true,
          lead_capture_mode:["progressive","high_intent","off"].includes(String(p.lead_capture_mode||""))?p.lead_capture_mode:"progressive",
          leads_count:count(leadRows,"organization_id",o.id),
          conversations_count:count(convRows,"organization_id",o.id),
          appointments_active:count(apptRows,"organization_id",o.id,(x:any)=>["requested","proposed","confirmed"].includes(x.status)),
          onboarding_progress:Math.round((onboardingCompleted/6)*100),
          onboarding_completed_steps:onboardingCompleted,
          activation_score:Math.min(100,activationScore),
          activation_stage:activationStage,
          sales_onboarding_status:invite?.status||null,
          requested_plan:invite?.requested_plan||null,
          customer_health_status:customerHealthStatus,
          customer_health_score:isPaidCustomer?Math.min(100,Math.max(0,customerHealthScore)):null,
          customer_health_risks:isPaidCustomer?customerRisks:[],
          customer_health_next_action:isPaidCustomer?customerHealthNext:null,
          recent_conversations_14d:recentConversations,
          recent_leads_14d:recentLeads,
          recent_warm_leads_14d:recentWarmLeads
        };
      })});
    }

    const orgId=String(body.organization_id||"");
    if(!uuidRe.test(orgId)) return json({error:"Ongeldige organisatie"},400);

    if(action==="toggle_widget"){
      const enabled=body.enabled===true;
      const {error}=await db.from("business_profiles").update({widget_enabled:enabled,updated_at:new Date().toISOString()}).eq("organization_id",orgId);
      if(error) throw error;
      await db.from("audit_events").insert({
        organization_id:orgId,
        actor_user_id:user.id,
        event_type:"platform_widget_toggle",
        entity_type:"business_profile",
        entity_id:orgId,
        payload:{widget_enabled:enabled}
      });
      return json({ok:true,widget_enabled:enabled});
    }

    if(action==="update_client"){
      const businessName=text(body.business_name,120);
      const receptionistName=text(body.receptionist_name,50)||"AI Assistent";
      const greeting=text(body.widget_greeting,180)||"Hallo! Waarmee kan ik helpen?";
      const notificationEmail=text(body.notification_email,250);
      const accent=text(body.widget_accent,7)||"#6d5dfc";
      const widgetAllowedDomains=normalizeDomains(body.widget_allowed_domains);
      const leadCaptureMode=["progressive","high_intent","off"].includes(String(body.lead_capture_mode||""))?String(body.lead_capture_mode):"progressive";
      if(!businessName) return json({error:"Bedrijfsnaam is verplicht"},400);
      if(notificationEmail&&!emailRe.test(notificationEmail)) return json({error:"Ongeldig e-mailadres"},400);
      if(!hexRe.test(accent)) return json({error:"Accentkleur moet een hexkleur zijn, bv. #6d5dfc"},400);

      const update={
        business_name:businessName,
        receptionist_name:receptionistName,
        widget_greeting:greeting,
        widget_accent:accent,
        widget_allowed_domains:widgetAllowedDomains,
        notification_email:notificationEmail||null,
        automation_enabled:body.automation_enabled===true,
        lead_capture_mode:leadCaptureMode,
        widget_enabled:body.widget_enabled!==false,
        updated_at:new Date().toISOString()
      };
      const {error}=await db.from("business_profiles").update(update).eq("organization_id",orgId);
      if(error) throw error;
      await db.from("organizations").update({name:businessName,updated_at:new Date().toISOString()}).eq("id",orgId);
      await db.from("audit_events").insert({
        organization_id:orgId,
        actor_user_id:user.id,
        event_type:"platform_client_update",
        entity_type:"business_profile",
        entity_id:orgId,
        payload:{fields:["business_name","receptionist_name","widget_greeting","widget_accent","widget_allowed_domains","notification_email","automation_enabled","lead_capture_mode","widget_enabled"]}
      });
      return json({ok:true});
    }

    if(action==="recent_leads"){
      const {data,error}=await db.from("leads")
        .select("id,name,email,phone,status,source,score,summary,created_at,last_contact_at")
        .eq("organization_id",orgId)
        .order("created_at",{ascending:false})
        .limit(30);
      if(error) throw error;
      return json({leads:data||[]});
    }

    return json({error:"Onbekende actie"},400);
  }catch(e){
    console.error("PLATFORM_ADMIN",e);
    return json({error:"Platformbeheer kon de aanvraag niet verwerken."},500);
  }
});
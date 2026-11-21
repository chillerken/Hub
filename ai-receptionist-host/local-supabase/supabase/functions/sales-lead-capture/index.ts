import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store, max-age=0","Referrer-Policy":"no-referrer"}});
const ORG_ID="09069b87-e02a-471d-977c-e4acd4e383b7";
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normPhone(raw:string){
  const s=raw.trim();
  if(!s)return null;
  const plus=s.startsWith("+");
  const d=s.replace(/\D/g,"");
  if(d.length<8||d.length>15)return null;
  if(plus)return "+"+d;
  if(d.startsWith("32"))return "+"+d;
  if(d.startsWith("0"))return "+32"+d.slice(1);
  return d;
}
async function sha(v:string){
  const dig=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(dig)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method"},405);
  try{
    const b=await req.json();
    if(String(b.company_website||"").trim())return json({ok:true});

    const name=String(b.name||"").trim().slice(0,120);
    const company=String(b.company||"").trim().slice(0,160);
    const email=String(b.email||"").trim().toLowerCase().slice(0,250);
    const phone=normPhone(String(b.phone||""));
    const website=String(b.website||"").trim().slice(0,300);
    const note=String(b.note||"").trim().slice(0,1500);
    const consent=b.contact_consent===true;
    const requestedPlan=["pilot","starter","pro","business"].includes(String(b.requested_plan||"").toLowerCase())
      ?String(b.requested_plan).toLowerCase():"pilot";
    const campaignCode=String(b.campaign_code||"").trim().slice(0,80);
    const utm={
      source:String(b.utm_source||"").trim().slice(0,120),
      medium:String(b.utm_medium||"").trim().slice(0,120),
      campaign:String(b.utm_campaign||"").trim().slice(0,180),
      content:String(b.utm_content||"").trim().slice(0,180),
      term:String(b.utm_term||"").trim().slice(0,180)
    };
    const referrer=String(b.referrer||"").trim().slice(0,500);

    if(!name||!company)return json({error:"Vul uw naam en bedrijfsnaam in."},400);
    if(!email&&!phone)return json({error:"Vul een e-mailadres of telefoonnummer in."},400);
    if(email&&!emailRe.test(email))return json({error:"Controleer het e-mailadres."},400);
    if(!consent)return json({error:"Toestemming voor contact is nodig om de demo aan te vragen."},400);

    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
    const hash=await sha("reception-ai-sales:"+ip);
    const since=new Date(Date.now()-3600000).toISOString();
    const {count}=await db.from("widget_rate_limits").select("id",{count:"exact",head:true})
      .eq("organization_id",ORG_ID).eq("client_hash",hash).gte("created_at",since);
    if((count||0)>=6)return json({error:"Te veel aanvragen. Probeer later opnieuw."},429);
    await db.from("widget_rate_limits").insert({organization_id:ORG_ID,client_hash:hash});

    let attributedCampaignId:string|null=null;
    if(/^[0-9a-f-]{36}$/i.test(campaignCode)){
      const {data:campaign}=await db.from("marketing_campaigns").select("id")
        .eq("organization_id",ORG_ID).eq("tracking_code",campaignCode).maybeSingle();
      if(campaign?.id)attributedCampaignId=campaign.id;
    }

    const dedupe="reception-ai-sales:"+await sha((email||phone||name+"|"+company).toLowerCase());
    const summary=[
      "Reception AI demo/pilot aanvraag",
      "Bedrijf: "+company,
      website?"Website: "+website:"",
      note?"Vraag/doel: "+note:""
    ].filter(Boolean).join("\n");
    const now=new Date().toISOString();

    let {data:lead}=await db.from("leads").select("*").eq("organization_id",ORG_ID).eq("dedupe_key",dedupe).maybeSingle();
    if(lead){
      const {data:u,error}=await db.from("leads").update({
        name,email:email||lead.email,phone:phone||lead.phone,status:"qualified",
        score:90,summary,last_contact_at:now,updated_at:now,contact_consent_at:lead.contact_consent_at||now,
        marketing_campaign_id:lead.marketing_campaign_id||attributedCampaignId,
        attributed_at:lead.attributed_at||(attributedCampaignId?now:null),
        qualification:{...(lead.qualification||{}),intent:"reception_ai_demo",company,website,requested_pilot:true,requested_plan:requestedPlan,funnel_stage:"demo_requested",utm,referrer}
      }).eq("id",lead.id).select("*").single();
      if(error)throw error; lead=u;
    }else{
      const {data:l,error}=await db.from("leads").insert({
        organization_id:ORG_ID,name,email:email||null,phone:phone||null,source:"reception_ai_sales",
        status:"qualified",score:90,summary,dedupe_key:dedupe,last_contact_at:now,contact_consent_at:now,
        marketing_campaign_id:attributedCampaignId,
        attributed_at:attributedCampaignId?now:null,
        qualification:{intent:"reception_ai_demo",company,website,requested_pilot:true,requested_plan:requestedPlan,funnel_stage:"demo_requested",utm,referrer}
      }).select("*").single();
      if(error)throw error; lead=l;
    }

    await db.from("sales_opportunities").upsert({
      organization_id:ORG_ID,
      lead_id:lead.id,
      temperature:"hot",
      stage:"demo_requested",
      confidence:95,
      next_action:"Personaliseer de demo voor "+company+" en plan een kort kennismakingsgesprek.",
      reason:"De prospect heeft zelf een Reception AI-demo/pilot aangevraagd en contacttoestemming gegeven.",
      channel:phone?"telefoon":email?"e-mail":"CRM",
      message:"",
      objection:"",
      missing_info:website?[]:["website"],
      can_contact:true,
      analyzed_at:now,
      updated_at:now
    },{onConflict:"organization_id,lead_id"});

    const {data:task}=await db.from("tasks").select("id").eq("organization_id",ORG_ID).eq("lead_id",lead.id)
      .eq("status","open").eq("title","Sales Agent: Reception AI demo opvolgen").limit(1);
    if(!task?.length){
      await db.from("tasks").insert({
        organization_id:ORG_ID,lead_id:lead.id,title:"Sales Agent: Reception AI demo opvolgen",
        status:"open",priority:"high",due_at:new Date(Date.now()+4*3600000).toISOString()
      });
    }

    let invite:any=null;
    const selfServeEmail=String(lead?.email||"").trim().toLowerCase();

    if(selfServeEmail){
      const {data:existingInvite}=await db.from("sales_onboarding_invites")
        .select("id,token,status,expires_at")
        .eq("sales_organization_id",ORG_ID)
        .eq("lead_id",lead.id)
        .eq("status","pending")
        .gt("expires_at",now)
        .order("created_at",{ascending:false})
        .limit(1).maybeSingle();
      invite=existingInvite||null;

      if(!invite){
        const {data:newInvite,error:inviteErr}=await db.from("sales_onboarding_invites").insert({
          sales_organization_id:ORG_ID,
          lead_id:lead.id,
          requested_plan:requestedPlan,
          status:"pending",
          expires_at:new Date(Date.now()+7*24*3600000).toISOString()
        }).select("id,token,status,expires_at").single();
        if(inviteErr)throw inviteErr;
        invite=newInvite;
      }else{
        await db.from("sales_onboarding_invites").update({
          requested_plan:requestedPlan,updated_at:now
        }).eq("id",invite.id);
      }
    }else{
      await db.from("sales_onboarding_invites").update({
        status:"cancelled",updated_at:now
      }).eq("sales_organization_id",ORG_ID)
        .eq("lead_id",lead.id)
        .eq("status","pending");
    }

    await db.from("audit_events").insert({
      organization_id:ORG_ID,event_type:"sales_lead_captured",
      entity_type:"lead",entity_id:lead.id,
      payload:{source:"reception_ai_landing",company,website,requested_plan:requestedPlan,utm,referrer,campaign_attributed:Boolean(attributedCampaignId),onboarding_invite_id:invite?.id||null}
    }).then(()=>{});

    return json({
      ok:true,
      onboarding_token:invite?.token||null,
      message:"Aanvraag ontvangen. We nemen persoonlijk contact met u op."
    });
  }catch(e){
    console.error(e);
    return json({error:"Uw aanvraag kon tijdelijk niet worden verwerkt."},500);
  }
});
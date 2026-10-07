import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json"
};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(value:string,locale:string){
  let x=String(value||"").replace(/[^\d+]/g,"");
  if(!x)return "";
  if(x.startsWith("00"))x="+"+x.slice(2);
  if(x.startsWith("0")&&String(locale||"").toLowerCase().includes("be"))x="+32"+x.slice(1);
  if(!x.startsWith("+")&&/^\d{8,15}$/.test(x))x="+"+x;
  return /^\+\d{8,15}$/.test(x)?x:"";
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  try{
    const b=await req.json().catch(()=>({}));
    const token=clean(b.widget_token,100);
    const leadId=clean(b.lead_id,80);
    const convId=clean(b.conversation_id,80);
    if(!token||!leadId||!convId)return json({error:"invalid_request"},400);

    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const {data:p}=await db.from("business_profiles").select("*").eq("widget_token",token).eq("widget_enabled",true).single();
    if(!p)return json({error:"Widget niet gevonden"},404);

    const origin=req.headers.get("origin");
    const allowed=Array.isArray(p.widget_allowed_domains)?p.widget_allowed_domains.map((x:string)=>String(x).trim().toLowerCase()).filter(Boolean):[];
    if(allowed.length){
      if(!origin)return json({error:"Deze widget is niet toegestaan op dit domein."},403);
      let host="";try{host=new URL(origin).hostname.toLowerCase().replace(/^www\./,"")}catch{}
      const trusted=["reception-ai-luxwash.vercel.app","reception-ai-rho.vercel.app"];
      const ok=trusted.includes(host)||allowed.some((d:string)=>host===d.replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/^www\./,""));
      if(!ok)return json({error:"Deze widget is niet toegestaan op dit domein."},403);
    }

    const {data:o}=await db.from("organizations").select("plan,trial_ends_at,subscription_status,status,is_internal").eq("id",p.organization_id).single();
    if(!o||o.status==="suspended"||(o.is_internal!==true&&((o.plan==="trial"&&new Date(o.trial_ends_at)<new Date())||(["starter","pro","business"].includes(o.plan)&&!["active","trialing"].includes(o.subscription_status))))){
      return json({error:"Deze receptionist is momenteel niet actief."},402);
    }

    const [{data:lead},{data:conv}]=await Promise.all([
      db.from("leads").select("*").eq("id",leadId).eq("organization_id",p.organization_id).single(),
      db.from("conversations").select("id,lead_id").eq("id",convId).eq("organization_id",p.organization_id).single()
    ]);
    if(!lead)return json({error:"Lead niet gevonden"},404);
    if(!conv||conv.lead_id!==leadId)return json({error:"Gesprek hoort niet bij deze aanvraag"},409);

    const contactConsent=b.contact_consent===true||String(b.contact_consent||"").toLowerCase()==="true";
    if(!contactConsent)return json({error:"Toestemming voor persoonlijke opvolging is vereist."},409);

    const name=clean(b.name,120);
    const email=clean(b.email,250).toLowerCase();
    const phone=normalizePhone(clean(b.phone,80),String(p.locale||""));
    if(!email&&!phone)return json({error:"Vul een geldig e-mailadres of telefoonnummer in."},400);
    if(email&&!emailRe.test(email))return json({error:"Vul een geldig e-mailadres in."},400);
    if(b.phone&&!phone)return json({error:"Vul een geldig telefoonnummer in."},400);

    const now=new Date().toISOString();
    const updates:any={contact_consent_at:lead.contact_consent_at||now,last_contact_at:now,updated_at:now};
    if(name&&(!lead.name||lead.name==="Websitebezoeker"))updates.name=name;
    if(email&&!lead.email)updates.email=email;
    if(phone&&!lead.phone)updates.phone=phone;

    let score=Math.max(Number(lead.score||20),20);
    const effectiveEmail=lead.email||updates.email||null;
    const effectivePhone=lead.phone||updates.phone||null;
    if(effectiveEmail)score=Math.max(score,35);
    if(effectivePhone)score=Math.max(score,40);
    if(effectiveEmail&&effectivePhone)score=Math.max(score,50);
    if((lead.qualification?.intent||"")==="appointment")score=Math.max(score,75);
    if(["human_handoff","urgent_handoff"].includes(String(lead.qualification?.intent||"")))score=Math.max(score,80);
    updates.score=score;

    const {data:updated,error}=await db.from("leads").update(updates).eq("id",leadId).eq("organization_id",p.organization_id).select("*").single();
    if(error)throw error;

    await db.from("audit_events").insert({
      organization_id:p.organization_id,actor_user_id:null,event_type:"lead.contact_capture_completed",
      entity_type:"lead",entity_id:leadId,payload:{
        via:"public_widget",
        has_email:Boolean(updated.email),
        has_phone:Boolean(updated.phone),
        score:updated.score
      }
    });

    const intent=String(updated.qualification?.intent||"");
    const nextPrompt=intent==="appointment"
      ?"Bedankt. Uw contactgegevens zijn opgeslagen. Welke dag of periode past voor u het best?"
      :intent==="urgent_handoff"
        ?"Bedankt. Uw contactgegevens zijn opgeslagen en de aanvraag kan persoonlijk worden opgevolgd."
        :intent==="human_handoff"
          ?"Bedankt. Uw contactgegevens zijn opgeslagen. Een medewerker kan u nu persoonlijk opvolgen."
          :"Bedankt. Uw contactgegevens zijn opgeslagen voor de opvolging van uw aanvraag.";

    return json({
      ok:true,
      contact:{
        name:updated.name==="Websitebezoeker"?null:updated.name,
        email:updated.email,
        phone:updated.phone
      },
      consent:{contact:Boolean(updated.contact_consent_at)},
      score:updated.score,
      next_prompt:nextPrompt
    });
  }catch(e){
    console.error("PUBLIC_CONTACT_CAPTURE",e);
    return json({error:"Contactgegevens konden niet worden opgeslagen."},500);
  }
});
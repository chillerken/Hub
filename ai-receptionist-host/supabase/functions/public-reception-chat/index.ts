import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});

const emailRe=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneRe=/(?:\+?\d[\d\s().\/-]{7,}\d)/;
const dateHintRe=/\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|morgen|overmorgen|volgende\s+week|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d{1,2}\s*(?:u|uur|:)\s*\d{0,2})\b/i;

function normalizePhone(raw:string,locale:string){
  const s=raw.trim();
  if(!s)return null;
  const hasPlus=s.startsWith("+");
  const digits=s.replace(/\D/g,"");
  if(digits.length<8||digits.length>15)return null;
  if(hasPlus)return "+"+digits;
  if((locale||"").toLowerCase().includes("be")){
    if(digits.startsWith("32"))return "+"+digits;
    if(digits.startsWith("0"))return "+32"+digits.slice(1);
  }
  return digits;
}

function extractName(message:string){
  const patterns=[
    /(?:mijn\s+naam\s+is|naam\s*[:=])\s*([A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,3})/i,
    /(?:ik\s+ben)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,2})(?:[,.!]|$)/i
  ];
  for(const p of patterns){
    const m=message.match(p);
    if(m?.[1]){
      const name=m[1].trim().slice(0,120);
      if(!/^(geïnteresseerd|interesse|op zoek|beschikbaar|dringend|boos)$/i.test(name))return name;
    }
  }
  return null;
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method"},405);

  try{
    const b=await req.json();
    const token=String(b.widget_token||"");
    const message=String(b.message||"").trim().slice(0,2000);
    const smokeTest=b.smoke_test===true;
    const smokeId=String(b.smoke_id||"").trim().slice(0,120);
    if(!token||!message)return json({error:"Ongeldige aanvraag"},400);

    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const {data:p}=await db.from("business_profiles").select("*").eq("widget_token",token).eq("widget_enabled",true).single();
    if(!p)return json({error:"Widget niet gevonden"},404);

    // Safe production smoke test: exercise the real profile/config + Gemini path without creating CRM records.
    // The marker is explicit and cannot be triggered by normal widget traffic.
    if(smokeTest){
      const key=Deno.env.get("GEMINI_API_KEY");
      if(!key)return json({error:"AI provider niet geconfigureerd",smoke_test:true},503);
      const services=Array.isArray(p.services)?p.services:[];
      const instructions=[
        "Je bent "+(p.receptionist_name||"Ava")+", AI-receptionist van "+p.business_name+".",
        "Dit is een geautomatiseerde production smoke test. Maak geen afspraak en vraag geen persoonsgegevens.",
        "Antwoord vriendelijk en compact. Gebruik uitsluitend de gegeven bedrijfsinformatie.",
        "Beschrijving: "+(p.description||"niet ingevuld"),
        "Diensten: "+(services.join(", ")||"niet ingevuld")
      ].join("\\n");
      const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
        method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
        body:JSON.stringify({system_instruction:{parts:[{text:instructions}]},contents:[{role:"user",parts:[{text:message}]}],generationConfig:{maxOutputTokens:180,temperature:.2,thinkingConfig:{thinkingBudget:0}}})
      });
      if(!ai.ok)return json({error:"AI provider smoke test mislukt",smoke_test:true,provider_status:ai.status},502);
      const j=await ai.json();
      const reply=String(j?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"").trim();
      if(reply.length<5)return json({error:"Leeg AI-antwoord",smoke_test:true},502);
      console.log("PUBLIC_AI smoke success",smokeId||"no-id");
      return json({smoke_test:true,smoke_id:smokeId||null,reply,receptionist_name:p.receptionist_name||"Ava",business_name:p.business_name});
    }

    const {data:o}=await db.from("organizations").select("plan,trial_ends_at,subscription_status,status").eq("id",p.organization_id).single();
    if(!o||o.status==="suspended"||(o.plan==="trial"&&new Date(o.trial_ends_at)<new Date())||(["starter","pro","business"].includes(o.plan)&&!["active","trialing"].includes(o.subscription_status))){
      return json({error:"Deze receptionist is momenteel niet actief."},402);
    }

    const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
    const enc=new TextEncoder().encode(token+":"+ip);
    const dig=await crypto.subtle.digest("SHA-256",enc);
    const hash=Array.from(new Uint8Array(dig)).map(x=>x.toString(16).padStart(2,"0")).join("");
    const since=new Date(Date.now()-60000).toISOString();
    const {count}=await db.from("widget_rate_limits").select("id",{count:"exact",head:true})
      .eq("organization_id",p.organization_id).eq("client_hash",hash).gte("created_at",since);
    if((count||0)>=12)return json({error:"Even te veel berichten. Probeer over een minuut opnieuw."},429);
    await db.from("widget_rate_limits").insert({organization_id:p.organization_id,client_hash:hash});

    const suppliedEmail=String(b.email||"").trim().slice(0,250)||null;
    const suppliedPhone=normalizePhone(String(b.phone||""),String(p.locale||""))||null;
    const suppliedName=String(b.name||"").trim().slice(0,120)||null;
    const contactConsent=b.contact_consent===true||String(b.contact_consent||"").toLowerCase()==="true";
    const marketingConsent=b.marketing_consent===true||String(b.marketing_consent||"").toLowerCase()==="true";
    const consentNow=new Date().toISOString();

    let leadId=b.lead_id||null;
    let convId=b.conversation_id||null;
    let lead:any=null;

    if(!leadId){
      const {data:l,error}=await db.from("leads").insert({
        organization_id:p.organization_id,
        name:suppliedName||"Websitebezoeker",
        email:suppliedEmail,
        phone:suppliedPhone,
        source:"public_widget",
        status:"qualifying",
        score:20,
        summary:message,
        dedupe_key:"widget:"+crypto.randomUUID(),
        contact_consent_at:contactConsent?consentNow:null,
        marketing_consent_at:marketingConsent?consentNow:null
      }).select("*").single();
      if(error)throw error;
      lead=l; leadId=l.id;
    }else{
      const {data:l,error}=await db.from("leads").select("*").eq("id",leadId).eq("organization_id",p.organization_id).single();
      if(error||!l)return json({error:"Lead niet gevonden"},404);
      lead=l;
    }

    if(!convId){
      const {data:c,error}=await db.from("conversations").insert({
        organization_id:p.organization_id,lead_id:leadId,channel:"web_chat",status:"open"
      }).select("id").single();
      if(error)throw error;
      convId=c.id;
    }

    await db.from("messages").insert({
      organization_id:p.organization_id,conversation_id:convId,role:"customer",content:message
    });

    const extractedEmail=suppliedEmail||message.match(emailRe)?.[0]?.toLowerCase()||null;
    const phoneMatch=message.match(phoneRe)?.[0]||"";
    const extractedPhone=suppliedPhone||normalizePhone(phoneMatch,String(p.locale||""))||null;
    const extractedName=suppliedName||extractName(message);

    const updates:any={
      last_contact_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
      summary:message
    };
    if(extractedEmail&&!lead.email)updates.email=extractedEmail;
    if(extractedPhone&&!lead.phone)updates.phone=extractedPhone;
    if(extractedName&&(!lead.name||lead.name==="Websitebezoeker"))updates.name=extractedName;
    if(contactConsent&&!lead.contact_consent_at)updates.contact_consent_at=consentNow;
    if(marketingConsent&&!lead.marketing_consent_at)updates.marketing_consent_at=consentNow;

    const effectiveEmail=lead.email||updates.email||null;
    const effectivePhone=lead.phone||updates.phone||null;
    const effectiveName=(lead.name&&lead.name!=="Websitebezoeker")?lead.name:(updates.name||null);

    let score=Math.max(Number(lead.score||20),20);
    if(effectiveEmail)score=Math.max(score,35);
    if(effectivePhone)score=Math.max(score,40);
    if(effectiveEmail&&effectivePhone)score=Math.max(score,50);
    if(effectiveName)score=Math.max(score,Math.min(55,score+5));
    if(message.length>=80)score=Math.max(score,Math.min(60,score+5));

    const low=message.toLowerCase();
    const human=/medewerker|mens|persoon|bellen|bel\s+mij|contacteer/i.test(low);
    const appointment=/afspraak|boeken|inplannen|beschikbaar|reserv|planning|tijdslot/i.test(low);
    const urgent=/dringend|spoed|urgent|klacht|ontevreden|probleem/i.test(low);

    let leadState="qualifying";
    let appointmentId:string|null=null;

    if(human||urgent){
      score=Math.max(score,urgent?90:80);
      updates.status="handoff";
      updates.score=score;
      updates.qualification={...(lead.qualification||{}),intent:urgent?"urgent_handoff":"human_handoff",has_email:!!effectiveEmail,has_phone:!!effectivePhone,contact_extracted:!!(updates.email||updates.phone||updates.name)};
      const {data:existing}=await db.from("handoffs").select("id").eq("organization_id",p.organization_id).eq("lead_id",leadId).eq("status","open").limit(1);
      if(!existing?.length){
        await db.from("handoffs").insert({
          organization_id:p.organization_id,lead_id:leadId,conversation_id:convId,
          reason:urgent?"Urgente of gevoelige aanvraag":"Bezoeker vraagt menselijke opvolging",status:"open"
        });
      }
      leadState="handoff";
    }else if(appointment){
      score=Math.max(score,effectiveEmail||effectivePhone?75:70);
      updates.status="qualified";
      updates.score=score;
      updates.qualification={...(lead.qualification||{}),intent:"appointment",has_email:!!effectiveEmail,has_phone:!!effectivePhone,contact_extracted:!!(updates.email||updates.phone||updates.name)};

      const {data:existingAppt}=await db.from("appointments").select("id,requested_text,status")
        .eq("organization_id",p.organization_id).eq("lead_id",leadId)
        .in("status",["requested","proposed","confirmed"]).order("created_at",{ascending:false}).limit(1);
      if(existingAppt?.[0]){
        appointmentId=existingAppt[0].id;
        if(dateHintRe.test(message)){
          const requested=[existingAppt[0].requested_text,message].filter(Boolean).join(" | ").slice(0,2000);
          await db.from("appointments").update({requested_text:requested,updated_at:new Date().toISOString()}).eq("id",appointmentId);
          await db.from("workflow_actions").update({
            payload:{appointment_id:appointmentId,requested_text:requested}
          }).eq("idempotency_key","appointment:"+appointmentId+":calendar_request").eq("status","pending");
        }
      }else{
        const {data:a,error:ae}=await db.from("appointments").insert({
          organization_id:p.organization_id,lead_id:leadId,status:"requested",requested_text:message,
          timezone:String(p.locale||"").toLowerCase().includes("be")?"Europe/Brussels":"UTC"
        }).select("id").single();
        if(ae)throw ae;
        appointmentId=a.id;
      }

      const {data:existingTask}=await db.from("tasks").select("id").eq("organization_id",p.organization_id)
        .eq("lead_id",leadId).eq("status","open").eq("title","Afspraakaanvraag opvolgen").limit(1);
      if(!existingTask?.length){
        await db.from("tasks").insert({
          organization_id:p.organization_id,lead_id:leadId,title:"Afspraakaanvraag opvolgen",status:"open",priority:"high"
        });
      }
      leadState="qualified";
    }else{
      updates.score=score;
      updates.qualification={...(lead.qualification||{}),intent:"general",has_email:!!effectiveEmail,has_phone:!!effectivePhone,contact_extracted:!!(updates.email||updates.phone||updates.name)};
      leadState=lead.status||"qualifying";
    }

    const {error:updateError}=await db.from("leads").update(updates).eq("id",leadId).eq("organization_id",p.organization_id);
    if(updateError)throw updateError;

    const {data:hist}=await db.from("messages").select("role,content").eq("conversation_id",convId)
      .order("created_at",{ascending:false}).limit(10);
    const history=(hist||[]).reverse().map((m:any)=>({
      role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]
    }));

    const services=Array.isArray(p.services)?p.services:[];
    const instructions=[
      "Je bent "+(p.receptionist_name||"Ava")+", AI-receptionist van "+p.business_name+".",
      "Antwoord vriendelijk, compact en professioneel in de taal van de klant.",
      "Gebruik uitsluitend de gegeven bedrijfsinformatie. Verzin niets.",
      "Een aanvraag is nooit automatisch een bevestigde afspraak.",
      "Vraag maximaal één nuttige vervolgvraag tegelijk.",
      "Als de klant vrijwillig contactgegevens deelt, bevestig kort dat die geregistreerd zijn.",
      "Bij afspraakvragen mag je geen live beschikbaarheid verzinnen.",
      "Beschrijving: "+(p.description||"niet ingevuld"),
      "Diensten: "+(services.join(", ")||"niet ingevuld"),
      "Openingsuren: "+JSON.stringify(p.opening_hours||{}),
      "Kwalificatievragen: "+JSON.stringify(p.qualification_questions||[]),
      "Escalatieregels: "+JSON.stringify(p.escalation_rules||[])
    ].join("\n");

    let reply="";
    const key=Deno.env.get("GEMINI_API_KEY");
    if(key){
      const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
        method:"POST",
        headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
        body:JSON.stringify({
          system_instruction:{parts:[{text:instructions}]},
          contents:history,
          generationConfig:{maxOutputTokens:700,temperature:.35,thinkingConfig:{thinkingBudget:0}}
        })
      });
      if(ai.ok){
        const j=await ai.json();
        reply=String(j?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"").trim();
        console.log("PUBLIC_AI gemini success");
      }
    }

    const hasContact=!!(effectiveEmail||effectivePhone);
    if(human||urgent){
      if(urgent)reply=hasContact
        ?"Ik geef dit meteen door voor persoonlijke opvolging. Uw contactgegevens zijn geregistreerd."
        :"Ik geef dit meteen door voor persoonlijke opvolging. Wat is het beste telefoonnummer of e-mailadres waarop we u kunnen bereiken?";
      else reply=hasContact
        ?"Natuurlijk. Ik geef dit door aan een medewerker. Uw contactgegevens zijn geregistreerd."
        :"Natuurlijk. Ik geef dit door aan een medewerker. Wat is het beste telefoonnummer of e-mailadres waarop we u kunnen bereiken?";
    }else if(appointment){
      reply="Graag. Ik kan hier geen live beschikbaarheid bevestigen. Welke dag of periode past voor u het best? Een medewerker of gekoppelde agenda bevestigt daarna het tijdstip.";
    }else if(reply.length<25){
      reply="Bedankt voor uw bericht. Ik registreer uw aanvraag. Kunt u kort aangeven waarmee we u kunnen helpen?";
    }

    await db.from("messages").insert({
      organization_id:p.organization_id,conversation_id:convId,role:"assistant",content:reply
    });

    return json({
      reply,
      lead_id:leadId,
      conversation_id:convId,
      appointment_id:appointmentId,
      receptionist_name:p.receptionist_name||"Ava",
      business_name:p.business_name,
      lead_state:leadState,
      contact:{name:effectiveName,email:effectiveEmail,phone:effectivePhone},
      consent:{contact:!!(lead.contact_consent_at||updates.contact_consent_at),marketing:!!(lead.marketing_consent_at||updates.marketing_consent_at)},
      score
    });
  }catch(e){
    console.error(e);
    return json({error:"De receptionist is tijdelijk niet beschikbaar."},500);
  }
});
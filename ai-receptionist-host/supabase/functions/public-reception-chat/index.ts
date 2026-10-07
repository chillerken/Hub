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

function parseExplicitBelgianSlot(message:string){
  const dm=message.match(/\\b(\\d{1,2})[\\/.\\-](\\d{1,2})(?:[\\/.\\-](\\d{2,4}))?\\b/);
  const tm=message.match(/\\b(?:om\\s*)?(\\d{1,2})(?:[:.]([0-5]\\d)|\\s*(?:u|uur)(?:\\s*([0-5]\\d))?)\\b/i);
  if(!dm||!tm)return null;
  let year=dm[3]?Number(dm[3]):new Date().getFullYear(); if(year<100)year+=2000;
  const month=Number(dm[2]),day=Number(dm[1]),hour=Number(tm[1]),minute=Number(tm[2]||tm[3]||0);
  if(month<1||month>12||day<1||day>31||hour>23)return null;
  const pad=(n:number)=>String(n).padStart(2,"0");
  const wall=year+"-"+pad(month)+"-"+pad(day)+"T"+pad(hour)+":"+pad(minute)+":00";
  const probe=new Date(wall+"+02:00");
  if(Number.isNaN(probe.getTime())||probe.getUTCFullYear()!==year||probe.getUTCMonth()+1!==month||probe.getUTCDate()!==day)return null;
  const lastSunday=(m:number)=>{const d=new Date(Date.UTC(year,m,0));return d.getUTCDate()-d.getUTCDay()};
  const dstStart=Date.UTC(year,2,lastSunday(3),1),dstEnd=Date.UTC(year,9,lastSunday(10),1),approx=Date.UTC(year,month-1,day,hour,minute);
  const offset=approx>=dstStart&&approx<dstEnd?"+02:00":"+01:00";
  const start=new Date(wall+offset); if(start.getTime()<Date.now()+5*60*1000)return null;
  const end=new Date(start.getTime()+60*60*1000);
  return {start_at:start.toISOString(),end_at:end.toISOString(),timezone:"Europe/Brussels"};
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
    if(!token||!message)return json({error:"Ongeldige aanvraag"},400);
    const low=message.toLowerCase();
    const human=/medewerker|mens|persoon|bellen|bel\s+mij|contacteer/i.test(low);
    const appointment=/afspraak|boeken|inplannen|beschikbaar|reserv|planning|tijdslot/i.test(low);
    const urgent=/dringend|spoed|urgent|klacht|ontevreden|probleem/i.test(low);

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
      const ok=allowed.some((d:string)=>host===d.replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/^www\./,""));
      if(!ok)return json({error:"Deze widget is niet toegestaan op dit domein."},403);
    }

    // Public widget tokens are intentionally public; never allow a special AI path to bypass
    // subscription and rate-limit controls through a client-supplied flag.
    if(smokeTest)return json({error:"Smoke test endpoint disabled"},404);

    const {data:o}=await db.from("organizations")
      .select("plan,trial_ends_at,subscription_status,status,is_internal")
      .eq("id",p.organization_id).single();
    const trialOk=o?.is_internal===true||(o?.plan==="trial"&&o?.trial_ends_at&&new Date(o.trial_ends_at).getTime()>Date.now());
    const paidOk=["starter","pro","business"].includes(String(o?.plan||""))&&["active","trialing"].includes(String(o?.subscription_status||""));
    if(!o||o.status==="suspended"||(!trialOk&&!paidOk)){
      return json({error:"Deze receptionist is momenteel niet actief."},402);
    }

    const effectivePlan=o.is_internal===true?"business":(["starter","pro","business"].includes(String(o.plan||""))?String(o.plan):"trial");
    let dailyLimit=500;
    if(effectivePlan!=="trial"){
      const {data:planRow}=await db.from("reception_ai_plan_catalog")
        .select("daily_ai_limit").eq("plan",effectivePlan).eq("active",true).maybeSingle();
      dailyLimit=Math.max(1,Number(planRow?.daily_ai_limit||500));
    }
    const minuteCaps:any={trial:30,starter:60,pro:120,business:240};
    const orgMinuteLimit=Number(minuteCaps[effectivePlan]||30);

    const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
    const enc=new TextEncoder().encode(token+":"+ip);
    const dig=await crypto.subtle.digest("SHA-256",enc);
    const hash=Array.from(new Uint8Array(dig)).map(x=>x.toString(16).padStart(2,"0")).join("");
    const since=new Date(Date.now()-60000).toISOString();
    const [{count:clientMinute},{count:orgMinute}]=await Promise.all([
      db.from("widget_rate_limits").select("id",{count:"exact",head:true})
        .eq("organization_id",p.organization_id).eq("client_hash",hash).gte("created_at",since),
      db.from("widget_rate_limits").select("id",{count:"exact",head:true})
        .eq("organization_id",p.organization_id).gte("created_at",since)
    ]);
    if((clientMinute||0)>=12)return json({error:"Even te veel berichten. Probeer over een minuut opnieuw."},429);
    if((orgMinute||0)>=orgMinuteLimit)return json({error:"Deze receptionist is tijdelijk erg druk. Probeer zo meteen opnieuw."},429);

    if(!human&&!urgent&&!appointment){
      const {data:quotaOk,error:quotaError}=await db.rpc("consume_ai_daily_quota",{
        p_organization_id:p.organization_id,
        p_limit:dailyLimit
      });
      if(quotaError)throw quotaError;
      if(quotaOk!==true)return json({error:"Daglimiet voor AI-verwerking bereikt. Neem contact op met het bedrijf."},429);
    }

    const {error:rateInsertError}=await db.from("widget_rate_limits").insert({organization_id:p.organization_id,client_hash:hash});
    if(rateInsertError)throw rateInsertError;

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

    const {error:customerMessageError}=await db.from("messages").insert({
      organization_id:p.organization_id,conversation_id:convId,role:"customer",content:message
    });
    if(customerMessageError)throw customerMessageError;

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

    let leadState="qualifying";
    let appointmentId:string|null=null;

    if(human||urgent){
      score=Math.max(score,urgent?90:80);
      updates.status="handoff";
      updates.score=score;
      updates.qualification={...(lead.qualification||{}),intent:urgent?"urgent_handoff":"human_handoff",has_email:!!effectiveEmail,has_phone:!!effectivePhone,contact_extracted:!!(updates.email||updates.phone||updates.name)};
      const {data:existing}=await db.from("handoffs").select("id").eq("organization_id",p.organization_id).eq("lead_id",leadId).eq("status","open").limit(1);
      if(!existing?.length){
        const {error:handoffError}=await db.from("handoffs").insert({
          organization_id:p.organization_id,lead_id:leadId,conversation_id:convId,
          reason:urgent?"Urgente of gevoelige aanvraag":"Bezoeker vraagt menselijke opvolging",status:"open"
        });
        if(handoffError)throw handoffError;
      }
      leadState="handoff";
    }else if(appointment){
      score=Math.max(score,effectiveEmail||effectivePhone?75:70);
      updates.status="qualified";
      updates.score=score;
      updates.qualification={...(lead.qualification||{}),intent:"appointment",has_email:!!effectiveEmail,has_phone:!!effectivePhone,contact_extracted:!!(updates.email||updates.phone||updates.name)};

      const slot=parseExplicitBelgianSlot(message);\n      const {data:existingAppt}=await db.from("appointments").select("id,requested_text,status,start_at,end_at")
        .eq("organization_id",p.organization_id).eq("lead_id",leadId)
        .in("status",["requested","proposed","confirmed"]).order("created_at",{ascending:false}).limit(1);
      if(existingAppt?.[0]){
        appointmentId=existingAppt[0].id;
        if(dateHintRe.test(message)){
          const requested=[existingAppt[0].requested_text,message].filter(Boolean).join(" | ").slice(0,2000);
          const appointmentPatch:any={requested_text:requested,updated_at:new Date().toISOString()};\n          if(slot){appointmentPatch.start_at=slot.start_at;appointmentPatch.end_at=slot.end_at;appointmentPatch.timezone=slot.timezone;}\n          const {error:appointmentUpdateError}=await db.from("appointments").update(appointmentPatch).eq("id",appointmentId);
          if(appointmentUpdateError)throw appointmentUpdateError;
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
        const {error:taskError}=await db.from("tasks").insert({
          organization_id:p.organization_id,lead_id:leadId,title:"Afspraakaanvraag opvolgen",status:"open",priority:"high"
        });
        if(taskError)throw taskError;
      }
      leadState="qualified";
    }else{
      updates.score=score;
      updates.qualification={...(lead.qualification||{}),intent:"general",has_email:!!effectiveEmail,has_phone:!!effectivePhone,contact_extracted:!!(updates.email||updates.phone||updates.name)};
      leadState=lead.status||"qualifying";
    }

    const {error:updateError}=await db.from("leads").update(updates).eq("id",leadId).eq("organization_id",p.organization_id);
    if(updateError)throw updateError;

    const {data:hist,error:historyError}=await db.from("messages").select("role,content").eq("conversation_id",convId)
      .order("created_at",{ascending:false}).limit(10);
    if(historyError)throw historyError;
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
      "Escalatieregels: "+JSON.stringify(p.escalation_rules||[]),
      "Aanvullende bedrijfsinstructies: "+(p.custom_instructions||"geen")
    ].join("\n");

    let reply="";
    const key=Deno.env.get("GEMINI_API_KEY");
    if(key&&!human&&!urgent&&!appointment){
      for(const model of ["gemini-3.5-flash-lite","gemini-3.1-flash-lite"]){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),9000);
        try{
          const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{
            method:"POST",
            signal:controller.signal,
            headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
            body:JSON.stringify({
              system_instruction:{parts:[{text:instructions}]},
              contents:history,
              generationConfig:{maxOutputTokens:700,temperature:.35}
            })
          });
          if(ai.ok){
            const j=await ai.json();
            reply=String(j?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"").trim();
            if(reply){
              console.log("PUBLIC_AI gemini success",model);
              break;
            }
          }else{
            console.error("PUBLIC_AI provider",model,ai.status);
            if(!([404,408,429].includes(ai.status)||ai.status>=500))break;
          }
        }catch(e){
          console.error("PUBLIC_AI request",model,e instanceof Error?e.message:String(e));
        }finally{
          clearTimeout(timer);
        }
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
      reply="Graag. Uw gewenste dag en tijd worden als afspraakaanvraag geregistreerd. Ik kan hier geen live beschikbaarheid bevestigen. Een medewerker of gekoppelde agenda bevestigt daarna het definitieve tijdstip.";
    }else if(!reply){
      reply="Bedankt voor uw bericht. Ik registreer uw aanvraag. Kunt u kort aangeven waarmee we u kunnen helpen?";
    }

    const {error:assistantMessageError}=await db.from("messages").insert({
      organization_id:p.organization_id,conversation_id:convId,role:"assistant",content:reply
    });
    if(assistantMessageError)throw assistantMessageError;

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
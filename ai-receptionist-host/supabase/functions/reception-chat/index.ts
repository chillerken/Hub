import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "jsr:@supabase/supabase-js@2.95.0/cors";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST") return json({error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
  const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default || Deno.env.get("SUPABASE_ANON_KEY");
  const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url=Deno.env.get("SUPABASE_URL")!; if(!pub||!sec) return json({error:"Server configuration incomplete"},500);
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}}}); const token=auth.slice(7);
  const {data:{user},error:ue}=await uc.auth.getUser(token); if(ue||!user) return json({error:"Unauthorized"},401);
  const {data:mem,error:me}=await uc.from("memberships").select("organization_id,role").eq("user_id",user.id).eq("active",true).single();
  if(me||!mem) return json({error:"No active organization"},403); const org=mem.organization_id;
  const {data:profile}=await uc.from("business_profiles").select("*").eq("organization_id",org).single();
  const body=await req.json(); const message=String(body.message||"").trim().slice(0,2000); if(!message) return json({error:"Message required"},400);
  const admin=createClient(url,sec,{auth:{persistSession:false}}); const {data:orgrow}=await admin.from("organizations").select("plan,subscription_status,trial_ends_at,status").eq("id",org).single(); const trialOk=orgrow?.plan==="trial"&&new Date(orgrow.trial_ends_at).getTime()>Date.now(); const paidOk=["starter","pro","business"].includes(orgrow?.plan||"")&&["active","trialing"].includes(orgrow?.subscription_status||""); if(!orgrow||orgrow.status==="suspended"||(!trialOk&&!paidOk))return json({error:"Subscription required"},402); let leadId=body.lead_id||null, conversationId=body.conversation_id||null;
  if(!leadId){
   const email=String(body.email||"").trim().toLowerCase().slice(0,255)||null; const phone=String(body.phone||"").trim().slice(0,50)||null;
   const name=String(body.name||"").trim().slice(0,120)||"Websitebezoeker"; const dedupe=email?("email:"+email):phone?("phone:"+phone):("web:"+crypto.randomUUID());
   const {data:lead,error:le}=await admin.from("leads").upsert({organization_id:org,name,email,phone,source:"web_chat",status:"qualifying",score:20,summary:message.slice(0,240),dedupe_key:dedupe},{onConflict:"organization_id,dedupe_key"}).select("id").single();
   if(le) throw le; leadId=lead.id;
  }
  if(!conversationId){const {data:conv,error:ce}=await admin.from("conversations").insert({organization_id:org,lead_id:leadId,channel:"web",status:"open"}).select("id").single();if(ce) throw ce;conversationId=conv.id;}
  await admin.from("messages").insert({organization_id:org,conversation_id:conversationId,role:"customer",content:message});
  const {data:hist}=await admin.from("messages").select("role,content").eq("conversation_id",conversationId).order("created_at",{ascending:false}).limit(10);
  const history=(hist||[]).reverse().map((m:any)=>({role:m.role==="assistant"?"assistant":"user",content:m.content}));
  const lower=message.toLowerCase(); const wantsHuman=/mens|medewerker|bellen|bel mij|klacht|dringend|urgent/.test(lower); const wantsAppointment=/afspraak|boeken|inplannen|wanneer|beschikbaar/.test(lower);
  const services=Array.isArray(profile?.services)?profile.services:[]; let reply="";
  const apiKey=Deno.env.get("GEMINI_API_KEY");
  if(apiKey){
    const instructions=[
      "Je bent "+(profile?.receptionist_name||"Ava")+", de AI-receptionist van "+(profile?.business_name||"dit bedrijf")+".",
      "Antwoord natuurlijk, vriendelijk, compact en professioneel in de taal van de klant.",
      "Gebruik uitsluitend bedrijfsinformatie die hieronder staat. Verzin geen prijzen, openingsuren, beschikbaarheid, beleid of diensten.",
      "Als informatie ontbreekt, zeg dat je dit laat bevestigen door een medewerker.",
      "Een aanvraag is nooit automatisch een bevestigde afspraak.",
      "Vraag maximaal één nuttige vervolgvraag tegelijk.",
      "Bedrijfsbeschrijving: "+(profile?.description||"niet ingevuld"),
      "Diensten: "+(services.length?services.join(", "):"niet ingevuld"),
      "Openingsuren: "+JSON.stringify(profile?.opening_hours||{}),
      "Kwalificatievragen: "+JSON.stringify(profile?.qualification_questions||[]),
      "Escalatieregels: "+JSON.stringify(profile?.escalation_rules||{})
    ].join("\n");
    try{
      const contents=history.map((m:any)=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}));
      const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:instructions}]},contents,generationConfig:{maxOutputTokens:700,temperature:0.35,thinkingConfig:{thinkingBudget:0}}})});
      if(ai.ok){const j=await ai.json();reply=String(j?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"").trim();console.log("AI_PROVIDER gemini success"); if(reply.length<25) reply="";}
      else console.error("Gemini",ai.status,await ai.text());
    }catch(e){console.error("Gemini request",e)}
  }
  if(wantsHuman) reply="Natuurlijk. Ik geef dit door aan een medewerker van "+(profile?.business_name||"het bedrijf")+" voor persoonlijke opvolging. Laat eventueel uw telefoonnummer achter zodat we u kunnen bereiken.";
  else if(wantsAppointment) reply="Graag. Ik kan hier geen live beschikbaarheid bevestigen. Welke dag of periode past voor u het best? Een medewerker bevestigt daarna de afspraak.";
  else if(!reply){
    if(services.length) reply="Hallo, ik ben "+(profile?.receptionist_name||"Ava")+" van "+(profile?.business_name||"het bedrijf")+". Onze diensten zijn "+services.slice(0,6).join(", ")+". Waarmee kan ik u precies helpen?";
    else reply="Hallo, ik ben "+(profile?.receptionist_name||"Ava")+". Vertel kort waarvoor u contact opneemt, dan registreer ik uw aanvraag.";
  }
  if(wantsHuman){await admin.from("handoffs").insert({organization_id:org,lead_id:leadId,conversation_id:conversationId,reason:"Bezoeker vraagt menselijke opvolging",status:"open"});await admin.from("leads").update({status:"handoff",score:80}).eq("id",leadId).eq("organization_id",org);}
  else if(wantsAppointment){await admin.from("tasks").insert({organization_id:org,lead_id:leadId,title:"Afspraakaanvraag opvolgen",status:"open",priority:"high"});await admin.from("leads").update({status:"qualified",score:70}).eq("id",leadId).eq("organization_id",org);}
  await admin.from("messages").insert({organization_id:org,conversation_id:conversationId,role:"assistant",content:reply});
  await admin.from("audit_events").insert({organization_id:org,actor_user_id:user.id,event_type:"conversation.message",entity_type:"conversation",entity_id:conversationId,payload:{channel:"web"}});
  return json({reply,lead_id:leadId,conversation_id:conversationId});
 }catch(e){console.error(e);return json({error:"Chat request failed"},500)}
});
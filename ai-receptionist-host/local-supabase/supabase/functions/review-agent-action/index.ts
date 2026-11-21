import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return J({error:"method_not_allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer "))return J({error:"unauthorized"},401);
  const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY");
  const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url=Deno.env.get("SUPABASE_URL")!; if(!pub||!sec)return J({error:"server_configuration"},500);
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await uc.auth.getUser(auth.slice(7)); if(ue||!user)return J({error:"unauthorized"},401);
  const {data:mem}=await uc.from("memberships").select("organization_id").eq("user_id",user.id).eq("active",true).single(); if(!mem)return J({error:"forbidden"},403);
  const {lead_id}=await req.json(); if(!lead_id)return J({error:"lead_required"},400);
  const admin=createClient(url,sec,{auth:{persistSession:false}});
  const {data:org}=await admin.from("organizations").select("plan,subscription_status,trial_ends_at,is_internal").eq("id",mem.organization_id).single();
  const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
  const paidOk=["pro","business"].includes(org?.plan||"")&&["active","trialing"].includes(org?.subscription_status||"");
  if(!trialOk&&!paidOk)return J({error:"upgrade_required"},402);
  const [{data:lead},{data:profile}]=await Promise.all([
   admin.from("leads").select("id,name,email,phone,status,summary,source").eq("id",lead_id).eq("organization_id",mem.organization_id).single(),
   admin.from("business_profiles").select("business_name,description,services").eq("organization_id",mem.organization_id).single()
  ]);
  if(!lead)return J({error:"lead_not_found"},404);
  if(lead.status!=="won")return J({error:"review_requires_won_lead"},409);
  const fallback={channel:lead.phone?"telefoon":lead.email?"e-mail":"CRM",message:`Hallo ${lead.name||""}, bedankt dat u voor ${profile?.business_name||"ons bedrijf"} koos. We horen graag hoe u onze service heeft ervaren. Als u tevreden bent, zouden we een eerlijke review erg waarderen. Bedankt!`.replace("Hallo ,","Hallo,")};
  let result=fallback; const key=Deno.env.get("GEMINI_API_KEY");
  if(key){
   const prompt=`Je bent de Review Agent van ${profile?.business_name||"een KMO"}. Geef alleen geldige JSON met keys channel en message. Schrijf in natuurlijk Nederlands een korte nazorgboodschap voor een echte klant waarvan de leadstatus WON is. Vraag om een eerlijke review zonder positieve review af te dwingen, zonder korting/incentive, zonder reviewtekst voor de klant te schrijven en zonder verzonnen reviewlink. Kies channel alleen uit telefoon, e-mail, CRM. Bedrijf: ${profile?.description||""}. Diensten: ${JSON.stringify(profile?.services||[])}. Klant: ${JSON.stringify(lead)}`;
   const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.3,maxOutputTokens:350,responseMimeType:"application/json"}})});
   if(ai.ok){const j=await ai.json();try{const x=JSON.parse(j?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"{}");if(x.message)result={channel:["telefoon","e-mail","CRM"].includes(x.channel)?x.channel:fallback.channel,message:String(x.message).slice(0,1000)};}catch{}}
  }
  await admin.from("audit_events").insert({organization_id:mem.organization_id,actor_user_id:user.id,event_type:"review_agent.request_prepared",entity_type:"lead",entity_id:lead.id,payload:{channel:result.channel}});
  return J({ok:true,...result});
 }catch(e){console.error(e);return J({error:"internal_error"},500)}
});
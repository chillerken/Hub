import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const ORG="09069b87-e02a-471d-977c-e4acd4e383b7";
const S:any={
 garage:{name:"Garage De Smet",description:"Lokale garage voor onderhoud en herstellingen van personenwagens.",services:["Onderhoud","Diagnose","Remmen","Banden","Herstellingen"],hours:"ma-vr 08:00-18:00"},
 vastgoed:{name:"Immo Nova",description:"Vastgoedkantoor voor verkoop, verhuur en waardebepalingen.",services:["Verkoop","Verhuur","Kennismaking","Schatting"],hours:"ma-vr 09:00-18:00, za 10:00-13:00"},
 diensten:{name:"Studio Nova",description:"Lokale dienstverlener voor advies, afspraken en offertes.",services:["Advies","Afspraak aanvragen","Offerte aanvragen","Klantenservice"],hours:"ma-vr 09:00-18:00"}
};
function fallback(m:string,s:any){
 const x=m.toLowerCase();
 if(/medewerker|mens|terugbellen|bel mij|bellen/.test(x))return "Natuurlijk. Wat is het beste telefoonnummer of e-mailadres waarop "+s.name+" u kan bereiken?";
 if(/afspraak|boeken|inplannen|morgen|deze week|beschikbaar|wanneer/.test(x))return "Graag. Ik kan hier geen live beschikbaarheid bevestigen. Welke dag of periode past voor u het best? Daarna kan een medewerker of gekoppelde agenda het tijdstip bevestigen.";
 if(/prijs|kost|kosten|hoeveel|offerte/.test(x))return "Dat hangt af van uw concrete vraag. Ik wil geen prijs verzinnen. Kunt u kort aangeven wat u precies nodig hebt?";
 if(/open|uren|opening/.test(x))return s.name+" is volgens deze demo-informatie geopend: "+s.hours+". Waarmee kan ik u verder helpen?";
 return "Bedankt voor uw vraag. "+s.name+" helpt met "+s.services.slice(0,4).join(", ")+". Kunt u kort aangeven wat u precies nodig hebt?";
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return J({error:"Method"},405);
 try{
  const b=await req.json(),message=String(b.message||"").trim().slice(0,1200);
  if(!message)return J({error:"Schrijf eerst een vraag."},400);
  const scenario=S[String(b.scenario||"garage")]||S.garage;
  const url=Deno.env.get("SUPABASE_URL")!,sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,sec,{auth:{persistSession:false}});
  const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const dig=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("reception-ai-demo:"+ip));
  const hash=Array.from(new Uint8Array(dig)).map(x=>x.toString(16).padStart(2,"0")).join("");
  const since=new Date(Date.now()-60000).toISOString();
  const {count}=await db.from("widget_rate_limits").select("id",{count:"exact",head:true}).eq("organization_id",ORG).eq("client_hash",hash).gte("created_at",since);
  if((count||0)>=15)return J({error:"Even te veel berichten. Probeer over een minuut opnieuw."},429);
  await db.from("widget_rate_limits").insert({organization_id:ORG,client_hash:hash});

  let reply="",mode="ai"; const key=Deno.env.get("GEMINI_API_KEY");
  if(key){
   try{
    const history=Array.isArray(b.history)?b.history.slice(-8).map((m:any)=>({role:m?.role==="assistant"?"model":"user",parts:[{text:String(m?.content||"").slice(0,1200)}]})).filter((m:any)=>m.parts[0].text):[];
    history.push({role:"user",parts:[{text:message}]});
    const instructions=["Huidige datum (Europe/Brussels): "+new Intl.DateTimeFormat("nl-BE",{timeZone:"Europe/Brussels",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date()),"Interpreteer vandaag en morgen uitsluitend ten opzichte van deze serverdatum. Een datum is geen bewijs van live beschikbaarheid.","Je bent Ava, AI-receptionist van "+scenario.name+".","Antwoord vriendelijk, compact en professioneel.","Gebruik alleen de gegeven bedrijfsinformatie. Verzin geen prijzen of live beschikbaarheid.","Bedrijf: "+scenario.description,"Diensten: "+scenario.services.join(", "),"Openingsuren: "+scenario.hours,"Vraag maximaal één nuttige vervolgvraag tegelijk."].join("\n");
    for(const model of ["gemini-3.5-flash-lite","gemini-3.1-flash-lite"]){
      const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:instructions}]},contents:history,generationConfig:{maxOutputTokens:450,temperature:.3}})});
      if(ai.ok){const o=await ai.json();reply=String(o?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"").trim();if(reply){mode="live_ai";break}}
      else {console.error("DEMO_AI",model,ai.status);if(!([404,408,429].includes(ai.status)||ai.status>=500))break}
    }
   }catch(e){console.error("DEMO_FETCH",e)}
  }
  if(!reply){mode="safe_fallback";reply=fallback(message,scenario)}
  return J({reply,mode,scenario:String(b.scenario||"garage"),business_name:scenario.name,receptionist_name:"Ava"});
 }catch(e){console.error("DEMO",e);return J({reply:"Bedankt voor uw vraag. Kunt u kort aangeven waarmee u geholpen wilt worden?",mode:"safe_fallback",business_name:"Demo bedrijf",receptionist_name:"Ava"});}
});

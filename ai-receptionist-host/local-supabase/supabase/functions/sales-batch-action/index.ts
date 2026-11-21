import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return J({error:"unauthorized"},401);
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY");
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url=Deno.env.get("SUPABASE_URL")!;
    if(!pub||!sec)return J({error:"server_configuration"},500);

    const uc=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const admin=createClient(url,sec,{auth:{persistSession:false}});
    const {data:{user},error:ue}=await uc.auth.getUser(auth.slice(7));
    if(ue||!user)return J({error:"unauthorized"},401);
    const {data:mem}=await uc.from("memberships").select("organization_id").eq("user_id",user.id).eq("active",true).single();
    if(!mem)return J({error:"forbidden"},403);

    const [{data:org},{data:profile},{data:cfg},{data:learningRows}]=await Promise.all([
      admin.from("organizations").select("plan,subscription_status,trial_ends_at,is_internal").eq("id",mem.organization_id).single(),
      admin.from("business_profiles").select("business_name,description,services,custom_instructions").eq("organization_id",mem.organization_id).single(),
      admin.from("sales_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle(),
      admin.from("commercial_learning_snapshots").select("metrics").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(1)
    ]);
    const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
    const paidOk=org?.plan==="business"&&["active","trialing"].includes(String(org?.subscription_status||""));
    if(!trialOk&&!paidOk)return J({error:"upgrade_required"},402);
    if(!profile)return J({error:"profile_not_found"},404);
    if(!cfg?.active)return J({error:"sales_agent_inactive"},409);

    const learning=learningRows?.[0]?.metrics||{};
    const commercialName=clean(cfg.brand_name,120)||profile.business_name;
    const productContext=clean(cfg.product_context,2400)||profile.description||"";
    const productServices=Array.isArray(cfg.product_services)&&cfg.product_services.length?cfg.product_services:profile.services;
    const minScore=Math.max(0,Math.min(100,Number(cfg.min_score||60)));
    const {data:leads,error:le}=await admin.from("leads")
      .select("id,name,email,phone,status,score,summary,source,qualification,contact_consent_at,updated_at")
      .eq("organization_id",mem.organization_id)
      .gte("score",minScore)
      .not("status","in","(won,lost)")
      .order("score",{ascending:false})
      .order("updated_at",{ascending:false})
      .limit(10);
    if(le)throw le;
    const L=leads||[];
    if(!L.length)return J({ok:true,count:0,analyses:[]});

    const fallback=L.map((lead:any)=>{
      const score=Number(lead.score||0);
      const hasContact=Boolean(clean(lead.email,250)||clean(lead.phone,80));
      const canContact=Boolean(hasContact&&lead.contact_consent_at);
      const intent=String(lead.qualification?.intent||"");
      const funnelStage=String(lead.qualification?.funnel_stage||"");
      return {
        lead_id:lead.id,
        temperature:score>=80?"hot":"warm",
        stage:funnelStage==="onboarding_started"?"onboarding":funnelStage==="demo_requested"||intent==="reception_ai_demo"?"demo_requested":intent==="appointment"?"decision":lead.status==="follow_up"?"follow_up":"qualified",
        confidence:Math.min(95,Math.max(50,score)),
        next_action:!hasContact?"Verzamel eerst contactgegevens":score>=80?"Neem vandaag persoonlijk contact op":"Volg binnen 24 uur op",
        reason:!hasContact?"Hoge interesse, maar geen e-mail of telefoon beschikbaar.":"De leadscore en recente vraag maken dit een actieve verkoopkans.",
        channel:lead.phone?"telefoon":lead.email?"e-mail":"CRM",
        message:hasContact?("Hallo"+(lead.name&&lead.name!=="Websitebezoeker"?" "+lead.name:"")+", bedankt voor uw interesse in "+commercialName+". Ik volg uw aanvraag graag persoonlijk op. Wat is voor u de beste volgende stap?"):"",
        objection:"",
        missing_info:!hasContact?["contactgegevens"]:[],
        can_contact:canContact
      };
    });

    let analyses:any[]=fallback;
    const key=Deno.env.get("GEMINI_API_KEY");
    if(key){
      const prompt=[
        "Je bent de Sales Agent van "+commercialName+".",
        "Analyseer alle verstrekte leads in één keer.",
        "Geef uitsluitend geldige JSON met key analyses. analyses is een array met exact één item per lead.",
        "Elk item bevat lead_id,temperature,stage,confidence,next_action,reason,channel,message,objection,missing_info.",
        "temperature: cold, warm of hot. confidence: 0-100. channel: telefoon, e-mail, whatsapp of CRM.",
        "Verzin geen prijs, korting, beschikbaarheid, garantie of klantbelofte. Geen manipulatieve druk.",
        "Als contactgegevens ontbreken: channel=CRM en message leeg.",
        "Salesdoel: "+(cfg.objective||"niet ingesteld"),
        "Aanbod: "+(cfg.offer||"niet ingesteld"),
        "Tone: "+(cfg.tone||"menselijk, professioneel en compact"),
        "Instructies: "+(cfg.instructions||""),
        "Historische commerciële performance: "+JSON.stringify(learning),
        "Commercieel aanbod: "+JSON.stringify({brand:commercialName,description:productContext,services:productServices,custom_instructions:profile.custom_instructions}),
        "Leads: "+JSON.stringify(L)
      ].join("\n");

      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
      try{
        const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
          method:"POST",signal:controller.signal,
          headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
          body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.2,maxOutputTokens:2400,responseMimeType:"application/json"}})
        });
        if(ai.ok){
          const raw=await ai.json();
          const parsed=JSON.parse(raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"{}");
          const byId=new Map((Array.isArray(parsed?.analyses)?parsed.analyses:[]).map((x:any)=>[String(x.lead_id),x]));
          analyses=fallback.map((fb:any)=>{
            const x:any=byId.get(fb.lead_id);
            if(!x)return fb;
            return {
              lead_id:fb.lead_id,
              temperature:["cold","warm","hot"].includes(x.temperature)?x.temperature:fb.temperature,
              stage:clean(x.stage,80)||fb.stage,
              confidence:Math.min(100,Math.max(0,Number(x.confidence||fb.confidence))),
              next_action:clean(x.next_action,500)||fb.next_action,
              reason:clean(x.reason,1000)||fb.reason,
              channel:["telefoon","e-mail","whatsapp","CRM"].includes(x.channel)?x.channel:fb.channel,
              message:clean(x.message,1800),
              objection:clean(x.objection,800),
              missing_info:Array.isArray(x.missing_info)?x.missing_info.map((z:any)=>clean(z,160)).filter(Boolean).slice(0,10):fb.missing_info,
              can_contact:fb.can_contact
            };
          });
        } else console.error("SALES_BATCH provider",ai.status);
      }catch(e){console.error("SALES_BATCH ai",e instanceof Error?e.message:String(e))}
      finally{clearTimeout(timer)}
    }

    const rows=analyses.map((x:any)=>({
      organization_id:mem.organization_id,lead_id:x.lead_id,temperature:x.temperature,stage:x.stage,
      confidence:Math.round(Number(x.confidence||0)),next_action:x.next_action,reason:x.reason,
      channel:x.channel,message:x.message,objection:x.objection,missing_info:x.missing_info,
      can_contact:x.can_contact,analyzed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }));
    const {error:upsertError}=await admin.from("sales_opportunities").upsert(rows,{onConflict:"organization_id,lead_id"});
    if(upsertError)throw upsertError;

    await admin.from("audit_events").insert({
      organization_id:mem.organization_id,actor_user_id:user.id,event_type:"sales_agent.batch_analysis_generated",
      entity_type:"organization",entity_id:mem.organization_id,payload:{count:rows.length,min_score:minScore}
    });

    return J({ok:true,count:analyses.length,analyses});
  }catch(e){
    console.error("SALES_BATCH",e);
    return J({error:"internal_error"},500);
  }
});
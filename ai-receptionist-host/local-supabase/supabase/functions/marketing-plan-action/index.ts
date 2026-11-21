import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);
const arr=(v:any)=>Array.isArray(v)?v:[];

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

    const {data:org}=await admin.from("organizations").select("plan,subscription_status,trial_ends_at,is_internal").eq("id",mem.organization_id).single();
    const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
    const paidOk=org?.plan==="business"&&["active","trialing"].includes(String(org?.subscription_status||""));
    if(!trialOk&&!paidOk)return J({error:"upgrade_required"},402);

    const [{data:profile},{data:config},{data:leads},{data:won},{data:learningRows}]=await Promise.all([
      admin.from("business_profiles").select("business_name,description,services,custom_instructions").eq("organization_id",mem.organization_id).single(),
      admin.from("marketing_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle(),
      admin.from("leads").select("status,score,source,summary,created_at").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(50),
      admin.from("leads").select("summary,source,created_at").eq("organization_id",mem.organization_id).eq("status","won").order("created_at",{ascending:false}).limit(12),
      admin.from("commercial_learning_snapshots").select("metrics").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(1)
    ]);
    if(!profile)return J({error:"profile_not_found"},404);
    if(!config?.active)return J({error:"marketing_agent_inactive"},409);

    const learning=learningRows?.[0]?.metrics||{};
    const commercialName=clean(config.brand_name,120)||profile.business_name;
    const productContext=clean(config.product_context,2400)||profile.description||"";
    const productServices=arr(config.product_services).length?arr(config.product_services):arr(profile.services);
    const channels=arr(config.channels).length?arr(config.channels):["facebook","instagram"];
    const count=Math.min(7,Math.max(1,Number(config.cadence_per_week||3)));
    const services=productServices.map((x:any)=>clean(x,180)).filter(Boolean);
    const leadSignals=(leads||[]).slice(0,16).map((x:any)=>clean(x.summary,500)).filter(Boolean);
    const stats={
      total:(leads||[]).length,
      warm:(leads||[]).filter((x:any)=>(x.score||0)>=60&&!["won","lost"].includes(x.status)).length,
      hot:(leads||[]).filter((x:any)=>(x.score||0)>=70&&!["won","lost"].includes(x.status)).length,
      won:(won||[]).length
    };

    const fallbackPosts=Array.from({length:count},(_,i)=>({
      objective:stats.hot?"Ondersteun bestaande interesse":"Genereer relevante aanvragen",
      audience:config.target_audience||"Prospects met behoefte aan de aangeboden diensten",
      channel:String(channels[i%channels.length]||"facebook"),
      hook:(services[i%Math.max(services.length,1)]||commercialName)+" zonder onnodige complexiteit.",
      content:"Meer weten over "+(services[i%Math.max(services.length,1)]||"onze dienstverlening")+"? "+commercialName+" helpt u met duidelijke informatie en een passende volgende stap.",
      cta:config.call_to_action||"Neem contact op voor meer informatie",
      rationale:"Onderdeel van het wekelijkse contentplan op basis van actuele CRM-signalen.",
      content_type:"organic_post"
    }));

    let posts:any[]=fallbackPosts;
    const key=Deno.env.get("GEMINI_API_KEY");
    if(key){
      const prompt=[
        "Je bent de Marketing Agent van "+commercialName+".",
        "Maak exact "+count+" bruikbare campagnedrafts voor de komende week.",
        "Geef uitsluitend geldige JSON met key posts. posts is een array met exact "+count+" items.",
        "Elk item heeft objective,audience,channel,hook,content,cta,rationale,content_type.",
        "Gebruik alleen deze kanalen: "+channels.join(", ")+". Verdeel de posts logisch over die kanalen.",
        "Gebruik uitsluitend verstrekte bedrijfs- en CRM-feiten. Verzin geen prijzen, kortingen, reviews, certificaten, garanties of beschikbaarheid.",
        "Vermijd repetitieve hooks. Schrijf natuurlijk Nederlands en pas de lengte aan het kanaal aan.",
        "Doelgroep: "+(config.target_audience||"niet ingesteld"),
        "Positionering: "+(config.positioning||"niet ingesteld"),
        "Contentpijlers: "+JSON.stringify(arr(config.content_pillars)),
        "Tone: "+(config.tone||"menselijk, lokaal en betrouwbaar"),
        "CTA: "+(config.call_to_action||"Neem contact op voor meer informatie"),
        "Instructies: "+(config.instructions||""),
        "Commercieel aanbod: "+JSON.stringify({brand:commercialName,description:productContext,services,custom_instructions:profile.custom_instructions}),
        "CRM statistiek: "+JSON.stringify(stats),
        "Recente klantbehoeften: "+JSON.stringify(leadSignals),
        "Gewonnen signalen: "+JSON.stringify((won||[]).map((x:any)=>x.summary).filter(Boolean)),
        "Historische campagneperformance: "+JSON.stringify(learning)
      ].join("\n");

      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
      try{
        const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{
          method:"POST",signal:controller.signal,
          headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
          body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.45,maxOutputTokens:2200,responseMimeType:"application/json"}})
        });
        if(ai.ok){
          const raw=await ai.json();
          const parsed=JSON.parse(raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"{}");
          const candidate=arr(parsed?.posts).slice(0,count);
          if(candidate.length===count){
            posts=candidate.map((x:any,i:number)=>({
              objective:clean(x.objective,600)||fallbackPosts[i].objective,
              audience:clean(x.audience,700)||fallbackPosts[i].audience,
              channel:channels.includes(String(x.channel))?String(x.channel):fallbackPosts[i].channel,
              hook:clean(x.hook,600)||fallbackPosts[i].hook,
              content:clean(x.content,4000)||fallbackPosts[i].content,
              cta:clean(x.cta,500)||fallbackPosts[i].cta,
              rationale:clean(x.rationale,1200),
              content_type:clean(x.content_type,80)||"organic_post"
            }));
          }
        } else console.error("MARKETING_PLAN provider",ai.status);
      }catch(e){console.error("MARKETING_PLAN ai",e instanceof Error?e.message:String(e))}
      finally{clearTimeout(timer)}
    }

    const rows=posts.map((x:any)=>({
      organization_id:mem.organization_id,status:"draft",
      objective:x.objective,audience:x.audience,channel:x.channel,
      hook:x.hook,content:x.content,cta:x.cta,rationale:x.rationale,
      source_signals:{stats,content_type:x.content_type,weekly_plan:true},
      created_by:user.id
    }));
    const {data:created,error:insertError}=await admin.from("marketing_campaigns").insert(rows).select("id,channel,objective,hook,content,cta");
    if(insertError)throw insertError;

    await admin.from("audit_events").insert({
      organization_id:mem.organization_id,actor_user_id:user.id,
      event_type:"marketing_agent.week_plan_generated",entity_type:"organization",entity_id:mem.organization_id,
      payload:{count:created?.length||0,channels,crm_stats:stats}
    });

    return J({ok:true,count:created?.length||0,posts:created||[],signals:stats});
  }catch(e){
    console.error("MARKETING_PLAN",e);
    return J({error:"internal_error"},500);
  }
});
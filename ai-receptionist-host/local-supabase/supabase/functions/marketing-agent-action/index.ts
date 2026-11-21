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
    const {data:activeContext}=await admin.from("user_org_context").select("organization_id").eq("user_id",user.id).maybeSingle();
    let membershipQuery=uc.from("memberships").select("organization_id").eq("user_id",user.id).eq("active",true);
    if(activeContext?.organization_id)membershipQuery=membershipQuery.eq("organization_id",activeContext.organization_id);
    const {data:mem,error:memError}=await membershipQuery.maybeSingle();
    if(memError||!mem)return J({error:memError?"organization_selection_required":"forbidden"},memError?409:403);

    const {data:org}=await admin.from("organizations").select("plan,subscription_status,trial_ends_at,is_internal").eq("id",mem.organization_id).single();
    const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
    const paidOk=org?.plan==="business"&&["active","trialing"].includes(String(org?.subscription_status||""));
    if(!trialOk&&!paidOk)return J({error:"upgrade_required"},402);

    const body=await req.json().catch(()=>({}));
    const requestedChannel=clean(body.channel,40);
    const requestedObjective=clean(body.objective,500);

    const [{data:profile},{data:config},{data:leads},{data:won},{data:recentAudits},{data:learningRows}]=await Promise.all([
      admin.from("business_profiles").select("business_name,description,services,custom_instructions,locale").eq("organization_id",mem.organization_id).single(),
      admin.from("marketing_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle(),
      admin.from("leads").select("status,score,source,summary,created_at").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(40),
      admin.from("leads").select("summary,source,created_at").eq("organization_id",mem.organization_id).eq("status","won").order("created_at",{ascending:false}).limit(12),
      admin.from("audit_events").select("event_type,payload,created_at").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(25),
      admin.from("commercial_learning_snapshots").select("metrics").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(1)
    ]);
    if(!profile)return J({error:"profile_not_found"},404);

    const learning=learningRows?.[0]?.metrics||{};
    const cfg=config||{
      name:"Marketing Agent",active:false,target_audience:"",positioning:"",
      channels:["facebook","instagram"],content_pillars:[],cadence_per_week:3,
      tone:"menselijk, lokaal en betrouwbaar",call_to_action:"Neem contact op voor meer informatie",
      instructions:"",save_drafts:true
    };
    const commercialName=clean(cfg.brand_name,120)||profile.business_name;
    const productContext=clean(cfg.product_context,2400)||profile.description||"";
    const productServices=arr(cfg.product_services).length?arr(cfg.product_services):arr(profile.services);
    const allowed=["facebook","instagram","linkedin","email","website","google_business","tiktok"];
    const channel=allowed.includes(requestedChannel)?requestedChannel:(arr(cfg.channels).find((x:any)=>allowed.includes(String(x)))||"facebook");
    const L=leads||[];
    const stats={
      total:L.length,
      warm:L.filter((x:any)=>(x.score||0)>=60&&!["won","lost"].includes(x.status)).length,
      hot:L.filter((x:any)=>(x.score||0)>=70&&!["won","lost"].includes(x.status)).length,
      won:(won||[]).length,
      web:L.filter((x:any)=>String(x.source||"").includes("web")).length
    };
    const services=productServices.map((x:any)=>clean(x,180)).filter(Boolean);
    const defaultObjective=requestedObjective||(stats.hot?"Ondersteun warme leads met relevante content":"Genereer nieuwe relevante aanvragen");
    const fallback={
      objective:defaultObjective,
      audience:cfg.target_audience||"Prospects met behoefte aan "+(services.slice(0,2).join(" en ")||"de aangeboden diensten"),
      channel,
      hook:commercialName+" helpt u met "+(services[0]||"een duidelijke volgende stap")+".",
      content:"Op zoek naar "+(services.slice(0,3).join(", ")||"een betrouwbare oplossing")+"? "+commercialName+" helpt u met duidelijke informatie en een passende volgende stap.",
      cta:cfg.call_to_action||"Neem contact op voor meer informatie",
      rationale:stats.hot?"Er zijn al warme leads; deze content ondersteunt de huidige vraag.":"De huidige CRM-signalen vragen om nieuwe relevante instroom.",
      content_type:"organic_post"
    };

    let result:any=fallback;
    const key=Deno.env.get("GEMINI_API_KEY");
    if(key){
      const prompt=[
        "Je bent "+(cfg.name||"Marketing Agent")+" van "+commercialName+".",
        "Geef uitsluitend geldige JSON met keys objective,audience,channel,hook,content,cta,rationale,content_type.",
        "channel moet exact één van facebook, instagram, linkedin, email, website, google_business, tiktok zijn.",
        "Gebruik uitsluitend verstrekte bedrijfs- en CRM-feiten. Verzin geen prijzen, kortingen, reviews, certificaten, garanties of beschikbaarheid.",
        "Schrijf bruikbare campagnecontent in natuurlijk Nederlands. Geen clickbait en geen ongefundeerde claims.",
        "Pas lengte en stijl aan het gekozen kanaal aan.",
        "Commercieel aanbod: "+JSON.stringify({name:commercialName,description:productContext,services,custom_instructions:profile.custom_instructions}),
        "Marketingconfig: "+JSON.stringify({
          target_audience:cfg.target_audience,positioning:cfg.positioning,channels:cfg.channels,
          content_pillars:cfg.content_pillars,tone:cfg.tone,call_to_action:cfg.call_to_action,instructions:cfg.instructions
        }),
        "Gekozen kanaal: "+channel,
        "Doel: "+defaultObjective,
        "CRM statistiek: "+JSON.stringify(stats),
        "Recente behoeften: "+JSON.stringify(L.slice(0,12).map((x:any)=>x.summary).filter(Boolean)),
        "Gewonnen-lead signalen: "+JSON.stringify((won||[]).slice(0,6).map((x:any)=>x.summary).filter(Boolean)),
        "Recente systeemsignalen: "+JSON.stringify((recentAudits||[]).slice(0,8).map((x:any)=>x.event_type)),
        "Historische campagneperformance (alleen gebruiken als er voldoende attributiedata is): "+JSON.stringify(learning)
      ].join("\n");

      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
      try{
        const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{
          method:"POST",signal:controller.signal,
          headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
          body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.35,maxOutputTokens:900,responseMimeType:"application/json"}})
        });
        if(ai.ok){
          const raw=await ai.json();
          const x=JSON.parse(raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"{}");
          if(x?.content&&x?.hook){
            result={
              objective:clean(x.objective,600)||fallback.objective,
              audience:clean(x.audience,700)||fallback.audience,
              channel:allowed.includes(String(x.channel))?String(x.channel):channel,
              hook:clean(x.hook,600),
              content:clean(x.content,4000),
              cta:clean(x.cta,500)||fallback.cta,
              rationale:clean(x.rationale,1200),
              content_type:clean(x.content_type,80)||"organic_post"
            };
          }
        }else console.error("MARKETING_AGENT provider",ai.status);
      }catch(e){console.error("MARKETING_AGENT ai",e instanceof Error?e.message:String(e))}
      finally{clearTimeout(timer)}
    }

    let campaignId:string|null=null;
    if(cfg.save_drafts!==false){
      const {data:campaign,error}=await admin.from("marketing_campaigns").insert({
        organization_id:mem.organization_id,status:"draft",
        objective:result.objective,audience:result.audience,channel:result.channel,
        hook:result.hook,content:result.content,cta:result.cta,rationale:result.rationale,
        source_signals:{stats,content_type:result.content_type,requested_objective:requestedObjective||null},
        created_by:user.id
      }).select("id").single();
      if(error)throw error;
      campaignId=campaign.id;
    }

    await admin.from("audit_events").insert({
      organization_id:mem.organization_id,actor_user_id:user.id,
      event_type:"marketing_agent.campaign_generated",entity_type:campaignId?"marketing_campaign":"organization",
      entity_id:campaignId||mem.organization_id,
      payload:{objective:result.objective,channel:result.channel,crm_stats:stats,campaign_id:campaignId}
    });

    return J({ok:true,campaign_id:campaignId,config_active:cfg.active===true,...result,signals:stats});
  }catch(e){
    console.error("MARKETING_AGENT",e);
    return J({error:"internal_error"},500);
  }
});
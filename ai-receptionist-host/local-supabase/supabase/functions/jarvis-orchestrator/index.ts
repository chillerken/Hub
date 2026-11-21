import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return J({error:"method_not_allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||"";const pub=Deno.env.get("SUPABASE_ANON_KEY");const sec=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");const url=Deno.env.get("SUPABASE_URL")!;
  if(!auth.startsWith("Bearer ")||!pub||!sec)return J({error:"unauthorized"},401);
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}}});const {data:{user}}=await uc.auth.getUser(auth.slice(7));if(!user)return J({error:"unauthorized"},401);
  const admin=createClient(url,sec);
  const {data:activeContext}=await admin.from("user_org_context").select("organization_id").eq("user_id",user.id).maybeSingle();
  let membershipQuery=uc.from("memberships").select("organization_id").eq("user_id",user.id).eq("active",true);
  if(activeContext?.organization_id)membershipQuery=membershipQuery.eq("organization_id",activeContext.organization_id);
  const {data:mem,error:memError}=await membershipQuery.maybeSingle();
  if(memError||!mem)return J({error:memError?"organization_selection_required":"forbidden"},memError?409:403);
  const {data:org}=await admin.from("organizations").select("plan,subscription_status,trial_ends_at,is_internal").eq("id",mem.organization_id).single();
  const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
  const paidOk=["business"].includes(org?.plan||"")&&["active","trialing"].includes(org?.subscription_status||"");
  if(!trialOk&&!paidOk)return J({error:"upgrade_required"},402);
  const [{data:p},{data:leads},{data:tasks},{data:handoffs},{data:salesCfg},{data:marketingCfg},{count:activeSequences},{count:marketingDrafts},{count:marketingScheduled},{data:learningRows}]=await Promise.all([
   admin.from("business_profiles").select("business_name,description,services").eq("organization_id",mem.organization_id).single(),
   admin.from("leads").select("id,name,email,phone,status,score,source,summary,qualification,contact_consent_at,updated_at").eq("organization_id",mem.organization_id).order("updated_at",{ascending:false}).limit(50),
   admin.from("tasks").select("id,lead_id,title,priority,due_at,status").eq("organization_id",mem.organization_id).eq("status","open").order("due_at",{ascending:true}).limit(30),
   admin.from("handoffs").select("id,lead_id,reason,status").eq("organization_id",mem.organization_id).eq("status","open").limit(20),
   admin.from("sales_agent_configs").select("active,min_score,brand_name,product_context").eq("organization_id",mem.organization_id).maybeSingle(),
   admin.from("marketing_agent_configs").select("active,brand_name,product_context").eq("organization_id",mem.organization_id).maybeSingle(),
   admin.from("sales_sequences").select("id",{count:"exact",head:true}).eq("organization_id",mem.organization_id).in("status",["active","paused"]),
   admin.from("marketing_campaigns").select("id",{count:"exact",head:true}).eq("organization_id",mem.organization_id).eq("status","draft"),
   admin.from("marketing_campaigns").select("id",{count:"exact",head:true}).eq("organization_id",mem.organization_id).eq("status","scheduled"),
   admin.from("commercial_learning_snapshots").select("metrics").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(1)
  ]);if(!p)return J({error:"profile_not_found"},404);
  const L=leads||[],T=tasks||[],Hf=handoffs||[],learning=learningRows?.[0]?.metrics||{};
  const learnedSalesChannel=String(learning?.sales_learning?.best_channel?.channel||"");
  const learnedMarketingChannel=String(learning?.marketing_learning?.best_campaign?.channel||"");
  const salesThreshold=Math.max(0,Math.min(100,Number(salesCfg?.min_score||60)));
  const salesLeads=L.filter((x:any)=>(x.score||0)>=salesThreshold&&!["won","lost"].includes(x.status));
  const salesActionable=salesLeads.filter((x:any)=>Boolean(String(x.email||"").trim()||String(x.phone||"").trim())&&Boolean(x.contact_consent_at));
  const salesMissingContact=salesLeads.filter((x:any)=>!String(x.email||"").trim()&&!String(x.phone||"").trim());
  const salesMissingConsent=salesLeads.filter((x:any)=>Boolean(String(x.email||"").trim()||String(x.phone||"").trim())&&!x.contact_consent_at);
  const stats={
    leads:L.length,
    sales_threshold:salesThreshold,
    warm:salesLeads.length,
    actionable:salesActionable.length,
    missing_contact:salesMissingContact.length,
    missing_consent:salesMissingConsent.length,
    won:L.filter((x:any)=>x.status==="won").length,
    followup:L.filter((x:any)=>x.status==="follow_up").length,
    onboarding:L.filter((x:any)=>String(x.qualification?.funnel_stage||"")==="onboarding_started").length,
    pilot_live:L.filter((x:any)=>String(x.qualification?.funnel_stage||"")==="pilot_live").length,
    value_event:L.filter((x:any)=>String(x.qualification?.funnel_stage||"")==="value_event").length,
    value_proven:L.filter((x:any)=>String(x.qualification?.funnel_stage||"")==="value_proven").length,
    open_tasks:T.length,
    handoffs:Hf.length,
    active_sequences:activeSequences||0,
    marketing_drafts:marketingDrafts||0,
    marketing_scheduled:marketingScheduled||0
  };
  const candidates:any[]=[];
  if(Hf.length)candidates.push({agent:"Receptionist",priority:"urgent",action:"Behandel open menselijke overdrachten",reason:Hf.length+" open handoff(s)"});
  if(stats.value_proven&&salesCfg?.active)candidates.push({agent:"Sales Agent",priority:"urgent",action:"Bespreek nu het passende betaalde Reception AI-plan",reason:stats.value_proven+" prospect(s) hebben tijdens de pilot meerdere echte waarde-events geregistreerd"});
  if(stats.value_event&&salesCfg?.active)candidates.push({agent:"Sales Agent",priority:"high",action:"Volg eerste pilotwaarde persoonlijk op",reason:stats.value_event+" prospect(s) hebben een eerste echt waarde-event geregistreerd"});
  if(stats.onboarding&&salesCfg?.active)candidates.push({agent:"Sales Agent",priority:"high",action:"Help actieve prospects hun onboarding afronden",reason:stats.onboarding+" prospect(s) zitten nog in onboarding"});
  if(stats.pilot_live&&salesCfg?.active)candidates.push({agent:"Sales Agent",priority:"normal",action:"Controleer pilotgebruik en stuur naar een meetbaar waarde-event",reason:stats.pilot_live+" prospect(s) zijn pilot-live zonder bewezen waarde"});
  if(stats.actionable&&salesCfg?.active)candidates.push({agent:"Sales Agent",priority:"high",action:"Volg warme leads persoonlijk op",reason:stats.actionable+" warme lead(s) hebben contactgegevens én contacttoestemming"+(learnedSalesChannel?" · historisch beste kanaal: "+learnedSalesChannel:"")});
  if(stats.missing_contact)candidates.push({agent:"Lead Agent",priority:"high",action:"Verzamel eerst contactgegevens van warme leads",reason:stats.missing_contact+" warme lead(s) zonder e-mail of telefoon"});
  if(stats.missing_consent)candidates.push({agent:"Lead Agent",priority:"high",action:"Vraag eerst contacttoestemming",reason:stats.missing_consent+" warme lead(s) hebben gegevens maar nog geen toestemming voor opvolging"});
  if(stats.active_sequences&&salesCfg?.active)candidates.push({agent:"Sales Agent",priority:"normal",action:"Controleer actieve follow-up sequences",reason:stats.active_sequences+" actieve of gepauzeerde sequence(s)"});
  if(stats.open_tasks)candidates.push({agent:"Lead Agent",priority:"high",action:"Werk open opvolgtaken af",reason:stats.open_tasks+" open taak/taken"});
  if(stats.won)candidates.push({agent:"Review Agent",priority:"normal",action:"Controleer gewonnen klanten voor nazorg",reason:stats.won+" gewonnen lead(s)"});
  if(marketingCfg?.active)candidates.push({
    agent:"Marketing Agent",
    priority:stats.warm?"normal":"high",
    action:stats.warm?"Maak ondersteunende campagnecontent":"Maak campagne om nieuwe aanvragen te genereren",
    reason:stats.warm
      ? "Er zijn al warme leads; bestaande kansen krijgen voorrang"
      : stats.marketing_drafts
        ? stats.marketing_drafts+" marketingdraft(s) wachten op beoordeling"
        : "Meer instroom is nu waardevol"+(learnedMarketingChannel?" · historisch beste campagnekanaal: "+learnedMarketingChannel:"")
  });
  let plan=candidates.slice(0,5),summary=stats.value_proven
    ?"Er is bewezen pilotwaarde. Geef conversie naar een passend betaald plan nu de hoogste prioriteit."
    :stats.value_event
      ?"Er is een eerste echt waarde-event. Volg dit persoonlijk op en probeer de waarde te herhalen."
      :stats.onboarding
        ?"Er zijn prospects in onboarding. Help hen eerst naar een live pilot."
        :stats.missing_contact||stats.missing_consent
          ?"Er zijn warme leads die nog niet allemaal veilig opvolgbaar zijn. Los eerst ontbrekende contactgegevens of toestemming op."
          :stats.actionable
            ?"Er zijn direct opvolgbare warme leads. Geef Sales voorrang en ondersteun daarna met Marketing."
            :"Focus eerst op klantvragen en opvolging, daarna op nieuwe instroom.";
  const key=Deno.env.get("GEMINI_API_KEY");
  if(key){
   const prompt="Je bent JARVIS, orchestrator van een KMO AI Business OS. Geef uitsluitend JSON met summary en plan. plan is max 5 items met agent,priority,action,reason. Kies agent alleen uit Receptionist, Lead Agent, Sales Agent, Review Agent, Marketing Agent. Gebruik uitsluitend de verstrekte feiten. Prioriteer omzetkansen, urgente klantvragen en achterstallige opvolging. Voer niets extern uit. Bedrijf: "+JSON.stringify(p)+". Statistiek: "+JSON.stringify(stats)+". Kandidaten: "+JSON.stringify(candidates)+". Recente leads: "+JSON.stringify(L.slice(0,12).map((x:any)=>({status:x.status,score:x.score,has_contact:Boolean(String(x.email||"").trim()||String(x.phone||"").trim()),contact_consent:Boolean(x.contact_consent_at),summary:x.summary,funnel_stage:String(x.qualification?.funnel_stage||""),trial_activation_score:Number(x.qualification?.trial_activation_score||0)})))+". Open taken: "+JSON.stringify(T.slice(0,12))+". Historische commerciële performance: "+JSON.stringify(learning)+". Commerciële agentcontext: "+JSON.stringify({sales:{brand:salesCfg?.brand_name||p.business_name,product_context:salesCfg?.product_context||""},marketing:{brand:marketingCfg?.brand_name||p.business_name,product_context:marketingCfg?.product_context||""}});
   const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.2,maxOutputTokens:700,responseMimeType:"application/json"}})});
   if(ai.ok){const j=await ai.json();try{const x=JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text||"{}");if(Array.isArray(x.plan)&&x.plan.length){plan=x.plan.slice(0,5).map((z:any)=>({agent:String(z.agent).slice(0,50),priority:String(z.priority).slice(0,20),action:String(z.action).slice(0,400),reason:String(z.reason).slice(0,400)}));summary=String(x.summary||summary).slice(0,800);}}catch{}}
  }
  await admin.from("audit_events").insert({organization_id:mem.organization_id,actor_user_id:user.id,event_type:"jarvis.plan_generated",entity_type:"organization",entity_id:mem.organization_id,payload:{stats,steps:plan.length}});
  return J({ok:true,summary,plan,stats});
 }catch(e){console.error(e);return J({error:"internal_error"},500)}
});
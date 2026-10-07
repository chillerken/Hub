import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json"
};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,max=1200)=>String(v??"").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return J({error:"unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const {data:{user},error:uerr}=await userDb.auth.getUser(auth.slice(7));
    if(uerr||!user)return J({error:"unauthorized"},401);

    const {data:mem}=await userDb.from("memberships").select("organization_id,role")
      .eq("user_id",user.id).eq("active",true).single();
    if(!mem||!["owner","admin"].includes(String(mem.role||"")))return J({error:"forbidden"},403);

    const {data:org}=await db.from("organizations")
      .select("is_internal")
      .eq("id",mem.organization_id)
      .single();
    if(org?.is_internal!==true)return J({error:"platform_only"},403);

    const body=await req.json().catch(()=>({}));
    const leadId=clean(body.lead_id,80);
    if(!/^[0-9a-f-]{36}$/i.test(leadId))return J({error:"invalid_lead_id"},400);

    const [{data:lead},{data:opp},{data:invite},{data:salesCfg},{data:appUrlRaw}]=await Promise.all([
      db.from("leads").select("id,name,email,phone,status,score,summary,qualification,contact_consent_at")
        .eq("id",leadId).eq("organization_id",mem.organization_id).single(),
      db.from("sales_opportunities").select("*")
        .eq("organization_id",mem.organization_id).eq("lead_id",leadId).maybeSingle(),
      db.from("sales_onboarding_invites").select("*")
        .eq("sales_organization_id",mem.organization_id).eq("lead_id",leadId)
        .order("created_at",{ascending:false}).limit(1).maybeSingle(),
      db.from("sales_agent_configs").select("brand_name,tone,objective,offer,preferred_channel,active,min_score")
        .eq("organization_id",mem.organization_id).maybeSingle(),
      db.rpc("get_platform_secret",{p_name:"reception_ai_app_url"})
    ]);
    if(!lead)return J({error:"lead_not_found"},404);

    let report:any=null,pilotValue:any=null;
    if(invite?.claimed_organization_id){
      const [{data:reportData},{data:valueData}]=await Promise.all([
        db.rpc("compute_trial_value_report",{p_organization_id:invite.claimed_organization_id}),
        db.rpc("compute_pilot_value_metrics",{p_organization_id:invite.claimed_organization_id,p_period_days:14})
      ]);
      report=reportData||null;
      pilotValue=valueData||null;
    }

    const brand=clean(salesCfg?.brand_name,120)||"Reception AI";
    const firstName=clean(lead.name,120)&&lead.name!=="Websitebezoeker"
      ?clean(lead.name,120).split(/\s+/)[0]
      :"";
    const salutation=firstName?"Hallo "+firstName+",":"Hallo,";
    const appUrl=clean(appUrlRaw,500)||"https://reception-ai-luxwash.vercel.app";
    const onboardingUrl=invite?.token
      ?appUrl.replace(/\/$/,"")+"/?auth=1&onboarding="+encodeURIComponent(invite.token)
      :"";

    const stage=String(opp?.stage||lead.qualification?.funnel_stage||"qualified");
    const requestedPlan=String(invite?.requested_plan||lead.qualification?.requested_plan||"pilot");
    const usage=report?.usage||{};
    const activation=report?.activation||{};
    const explicitPlan=["starter","pro","business"].includes(requestedPlan)?requestedPlan:"";
    const highVolume=Number(usage.public_conversations||0)>=30&&(Number(usage.qualified_leads||0)>=5||Number(usage.appointment_requests||0)>=3||Number(usage.handoffs||0)>=3);
    const proven=String(activation?.stage||"")==="value_proven"||pilotValue?.conversion_ready===true||Number(usage.qualified_leads||0)>=2||Number(usage.appointment_requests||0)>=1;
    const recommendedPlan=explicitPlan||(highVolume?"business":proven?"pro":"starter");
    const planMeta:any={
      starter:{label:"Start",price:"€99/mnd",reason:"Geschikt voor een compacte receptionistflow met lead capture en meldingen."},
      pro:{label:"Growth",price:"€199/mnd",reason:"Past beter wanneer kwalificatie, CRM en follow-up aantoonbaar waarde opleveren."},
      business:{label:"Pro",price:"vanaf €349/mnd",reason:"Past bij hogere volumes, uitgebreidere workflows of meerdere commerciële automatiseringen."}
    };
    const recommendation=planMeta[recommendedPlan]||planMeta.pro;
    const billingUrl=invite?.token
      ?appUrl.replace(/\/$/,"")+"/?auth=1&onboarding="+encodeURIComponent(invite.token)+"&next=billing&plan="+encodeURIComponent(recommendedPlan)
      :"";

    let subject=brand+" – volgende stap";
    let message="";
    let cta="";

    if(stage==="demo_requested"){
      subject=brand+" – uw 14-daagse pilot";
      cta=onboardingUrl?"Start uw pilot: "+onboardingUrl:"Plan een korte demo of onboarding.";
      message=[
        salutation,
        "",
        "Bedankt voor uw interesse in "+brand+". Uw demo-aanvraag staat klaar.",
        onboardingUrl
          ?"U kunt uw 14-daagse pilot meteen voorbereiden via deze persoonlijke onboardinglink:"
          :"Ik help u graag met de volgende stap richting een korte demo of pilot.",
        onboardingUrl||"",
        "",
        "Tijdens de pilot kunt u de receptionist instellen, de widget testen en echte klantvragen meten.",
        "",
        "Als u wilt, overlopen we samen kort welke flow voor uw bedrijf het meeste waarde kan opleveren."
      ].filter(Boolean).join("\n");
    }else if(stage==="onboarding"||lead.qualification?.funnel_stage==="onboarding_started"){
      const next=clean(report?.activation?.stage==="value_proven"
        ?"uw resultaten bekijken"
        :opp?.next_action||"de volgende onboardingstap afronden",300);
      subject=brand+" – onboarding verderzetten";
      cta=onboardingUrl?"Ga verder met onboarding: "+onboardingUrl:next;
      message=[
        salutation,
        "",
        "Uw "+brand+"-account is gekoppeld en de onboarding is gestart.",
        "De handigste volgende stap is: "+next,
        onboardingUrl?"U kunt hier verdergaan: "+onboardingUrl:"",
        "",
        "Als iets blokkeert, laat gerust weten op welke stap u vastloopt."
      ].filter(Boolean).join("\n");
    }else if(stage==="pilot_live"){
      subject=brand+" – uw pilot is live";
      cta="Laat de widget enkele echte gesprekken verwerken en bekijk daarna samen de resultaten.";
      message=[
        salutation,
        "",
        "Uw "+brand+"-pilot is live en klaar voor echte bezoekers.",
        "De volgende stap is niet meer instellen, maar meten: echte gesprekken, gekwalificeerde leads en concrete vervolgacties.",
        "",
        "Zodra er voldoende gebruik is, kunnen we samen bekijken waar "+brand+" aantoonbaar tijd of gemiste aanvragen opvangt."
      ].join("\n");
    }else if(stage==="value_event"){
      subject=brand+" – eerste echte waarde zichtbaar";
      const facts=[
        Number(usage.public_conversations||0)>0?usage.public_conversations+" websitegesprek(ken)":null,
        Number(usage.qualified_leads||0)>0?usage.qualified_leads+" gekwalificeerde lead(s)":null,
        Number(usage.handoffs||0)>0?usage.handoffs+" handoff(s)":null,
        Number(usage.appointment_requests||0)>0?usage.appointment_requests+" afspraakaanvraag/aanvragen":null
      ].filter(Boolean);
      cta="Bespreek kort hoe we dit resultaat kunnen herhalen en opschalen.";
      message=[
        salutation,
        "",
        "Er is tijdens uw "+brand+"-pilot een eerste echt waarde-event geregistreerd.",
        facts.length?"Tot nu toe zien we: "+facts.join(" · ")+".":"",
        "",
        "Dat is een goed moment om kort te bekijken wat werkte en hoe we dit resultaat kunnen herhalen.",
        "",
        "Wilt u dat we samen de volgende stap bepalen?"
      ].filter(Boolean).join("\n");
    }else if(stage==="conversion_ready"||stage==="value_proven"){
      subject=brand+" – uw pilot is klaar voor de volgende stap";
      const facts=[
        Number(usage.public_conversations||0)>0?usage.public_conversations+" websitegesprek(ken)":null,
        Number(usage.qualified_leads||0)>0?usage.qualified_leads+" gekwalificeerde lead(s)":null,
        Number(usage.handoffs||0)>0?usage.handoffs+" handoff(s)":null,
        Number(usage.appointment_requests||0)>0?usage.appointment_requests+" afspraakaanvraag/aanvragen":null,
        Number(usage.customer_revenue_cents||0)>0?"€"+(Number(usage.customer_revenue_cents)/100).toFixed(2)+" gemeten klantomzet":null
      ].filter(Boolean);
      cta=billingUrl?"Bekijk aanbevolen plan: "+billingUrl:"Kies samen het passende productieplan.";
      message=[
        salutation,
        "",
        stage==="conversion_ready"
          ?"Uw "+brand+"-pilot heeft voldoende echte gebruiks- en commerciële signalen om een productie-uitrol te beoordelen."
          :"Uw "+brand+"-pilot heeft inmiddels meerdere echte waarde-events geregistreerd.",
        facts.length?"Gemeten resultaat: "+facts.join(" · ")+".":"",
        "",
        "De pilot heeft dus niet alleen technisch gewerkt; er is meetbare praktijkwaarde ontstaan.",
        "Op basis van uw huidige pilotdata is "+recommendation.label+" ("+recommendation.price+") de meest logische start: "+recommendation.reason,
        billingUrl?"U kunt het plan hier zelf bekijken en activeren: "+billingUrl:"",
        "",
        "Wilt u dit kort afstemmen?"
      ].filter(Boolean).join("\n");
    }else if(stage==="won"||lead.status==="won"||invite?.status==="converted"){
      subject=brand+" – welkom";
      cta="Rond de productie-onboarding af.";
      message=[
        salutation,
        "",
        "Bedankt voor uw vertrouwen in "+brand+". Uw account is als klant geactiveerd.",
        "De volgende stap is de productie-inrichting verder afwerken en de resultaten blijven opvolgen.",
        "",
        "Als u ergens ondersteuning bij nodig hebt, kunt u rechtstreeks antwoorden."
      ].join("\n");
    }else{
      subject=brand+" – volgende stap";
      cta="Plan een korte kennismaking.";
      message=[
        salutation,
        "",
        "Bedankt voor uw interesse in "+brand+".",
        "Ik help u graag om te bekijken welke klantvragen, leads of opvolging u het beste als eerste kunt automatiseren.",
        "",
        "Wilt u kort afstemmen wat voor uw bedrijf de meest nuttige eerste stap is?"
      ].join("\n");
    }

    const preferred=String(opp?.channel||salesCfg?.preferred_channel||"auto").toLowerCase();
    const channel=preferred.includes("whatsapp")&&lead.phone?"whatsapp":lead.email?"email":lead.phone?"phone":"crm";

    const action=String(body.action||"draft");
    let workflowActionId:string|null=null;
    let queuedChannel:string|null=null;

    if(action==="approve_and_queue"){
      if(salesCfg?.active!==true)return J({error:"sales_agent_inactive"},409);
      if(!lead.contact_consent_at)return J({error:"contact_consent_required"},409);
      const {data:integrations}=await db.from("tenant_integrations").select("channel,status,capabilities")
        .eq("organization_id",mem.organization_id).eq("is_default",true).eq("status","active").in("channel",["email","whatsapp"]);
      const emailReady=Boolean(lead.email&&(integrations||[]).some((x:any)=>x.channel==="email"&&Array.isArray(x.capabilities)&&x.capabilities.includes("lead_follow_up")));
      const waReady=Boolean(lead.phone&&(integrations||[]).some((x:any)=>x.channel==="whatsapp"&&Array.isArray(x.capabilities)&&x.capabilities.includes("lead_follow_up")));
      if(channel==="email"&&emailReady)queuedChannel="email";
      else if(channel==="whatsapp"&&waReady)queuedChannel="whatsapp";
      else if(emailReady)queuedChannel="email";
      else if(waReady)queuedChannel="whatsapp";
      if(!queuedChannel)return J({error:"delivery_channel_unavailable"},409);

      const ctaAlreadyIncluded=billingUrl?message.includes(billingUrl):message.includes(cta);
      const finalMessage=[message,cta&&!ctaAlreadyIncluded?cta:""].filter(Boolean).join("\n\n").slice(0,1800);
      const day=new Date().toISOString().slice(0,10);
      const idempotencyKey="sales-conversion:"+lead.id+":"+stage+":"+day;
      const {data:wa,error:we}=await db.from("workflow_actions").upsert({
        organization_id:mem.organization_id,
        lead_id:lead.id,
        action_type:"lead_follow_up",
        channel:queuedChannel,
        status:"pending",
        priority:["conversion_ready","value_proven"].includes(stage)?"high":"normal",
        idempotency_key:idempotencyKey,
        payload:{
          source:"sales_conversion_approved",
          explicit_user_action:true,
          custom_message:finalMessage,
          subject:clean(subject,180),
          sales_stage:stage,
          recommended_plan:recommendedPlan,
          billing_url:billingUrl||null
        },
        scheduled_at:new Date().toISOString()
      },{onConflict:"idempotency_key",ignoreDuplicates:true}).select("id").maybeSingle();
      if(we)throw we;
      workflowActionId=wa?.id||null;
      await db.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,
        event_type:"sales_conversion_draft.approved",
        entity_type:"lead",entity_id:lead.id,
        payload:{stage,channel:queuedChannel,recommended_plan:recommendedPlan,workflow_action_id:workflowActionId}
      });
    }

    await db.from("audit_events").insert({
      organization_id:mem.organization_id,
      actor_user_id:user.id,
      event_type:"sales_conversion_draft.generated",
      entity_type:"lead",
      entity_id:lead.id,
      payload:{
        stage,
        channel,
        requested_plan:requestedPlan,
        activation_stage:activation?.stage||null,
        activation_score:activation?.score||null
      }
    });

    return J({
      ok:true,
      lead_id:lead.id,
      stage,
      channel,
      subject,
      message,
      cta,
      onboarding_url:onboardingUrl||null,
      recommendation:{plan:recommendedPlan,label:recommendation.label,price:recommendation.price,reason:recommendation.reason},
      billing_url:billingUrl||null,
      evidence:{
        activation_stage:activation?.stage||null,
        activation_score:activation?.score||0,
        pilot_value_score:pilotValue?.score||0,
        conversion_ready:pilotValue?.conversion_ready===true,
        usage
      },
      action,
      workflow_action_id:workflowActionId,
      queued_channel:queuedChannel,
      external_send:action==="approve_and_queue"
    });
  }catch(e){
    console.error("SALES_CONVERSION_DRAFT",e);
    return J({error:"conversion_draft_failed"},500);
  }
});
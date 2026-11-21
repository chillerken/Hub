import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);
const arr=(v:any)=>Array.isArray(v)?v:[];
const parseJsonLoose=(v:any)=>{
  const raw=String(v??"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
  if(!raw)return {};
  try{return JSON.parse(raw)}catch{}
  const noTrailing=raw.replace(/,\s*([}\]])/g,"$1");
  try{return JSON.parse(noTrailing)}catch{}
  const start=Math.min(...["{","["].map(ch=>noTrailing.indexOf(ch)).filter(i=>i>=0));
  const end=Math.max(noTrailing.lastIndexOf("}"),noTrailing.lastIndexOf("]"));
  if(Number.isFinite(start)&&start>=0&&end>start){
    try{return JSON.parse(noTrailing.slice(start,end+1))}catch{}
  }
  throw new Error("AI returned invalid JSON");
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return json({error:"unauthorized"},401);
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY");
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url=Deno.env.get("SUPABASE_URL")!;
    if(!pub||!sec)return json({error:"server_configuration"},500);

    const uc=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const admin=createClient(url,sec,{auth:{persistSession:false}});
    const {data:{user},error:ue}=await uc.auth.getUser(auth.slice(7));
    if(ue||!user)return json({error:"unauthorized"},401);
    const {data:activeContext}=await admin.from("user_org_context").select("organization_id").eq("user_id",user.id).maybeSingle();
    let membershipQuery=uc.from("memberships").select("organization_id").eq("user_id",user.id).eq("active",true);
    if(activeContext?.organization_id)membershipQuery=membershipQuery.eq("organization_id",activeContext.organization_id);
    const {data:mem,error:memError}=await membershipQuery.maybeSingle();
    if(memError||!mem)return json({error:memError?"organization_selection_required":"forbidden"},memError?409:403);

    const body=await req.json().catch(()=>({}));
    const leadId=clean(body.lead_id,80);
    const mode=["analyze","create_task","queue_outreach"].includes(String(body.mode))?String(body.mode):"analyze";
    if(!leadId)return json({error:"lead_required"},400);

    const {data:org}=await admin.from("organizations").select("plan,subscription_status,trial_ends_at,is_internal").eq("id",mem.organization_id).single();
    const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
    const paidOk=org?.plan==="business"&&["active","trialing"].includes(String(org?.subscription_status||""));
    if(!trialOk&&!paidOk)return json({error:"upgrade_required"},402);

    const [{data:lead},{data:profile},{data:config},{data:convs},{data:learningRows}]=await Promise.all([
      admin.from("leads").select("id,name,email,phone,status,score,summary,qualification,source,contact_consent_at,created_at,updated_at").eq("id",leadId).eq("organization_id",mem.organization_id).single(),
      admin.from("business_profiles").select("business_name,description,services,qualification_questions,custom_instructions").eq("organization_id",mem.organization_id).single(),
      admin.from("sales_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle(),
      admin.from("conversations").select("id").eq("organization_id",mem.organization_id).eq("lead_id",leadId).order("created_at",{ascending:false}).limit(1),
      admin.from("commercial_learning_snapshots").select("metrics").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(1)
    ]);
    if(!lead)return json({error:"lead_not_found"},404);
    if(!profile)return json({error:"profile_not_found"},404);

    const cfg=config||{
      name:"Sales Agent",active:false,min_score:60,preferred_channel:"auto",follow_up_due_hours:24,
      objective:"",offer:"",tone:"menselijk, professioneel en compact",instructions:"",create_task_by_default:true
    };

    const commercialName=clean(cfg.brand_name,120)||profile.business_name;
    const productContext=clean(cfg.product_context,2400)||profile.description||"";
    const productServices=arr(cfg.product_services).length?arr(cfg.product_services):arr(profile.services);

    let messages:any[]=[];
    if(convs?.[0]){
      const {data}=await admin.from("messages").select("role,content").eq("organization_id",mem.organization_id)
        .eq("conversation_id",convs[0].id).order("created_at",{ascending:true}).limit(30);
      messages=data||[];
    }

    const learning=learningRows?.[0]?.metrics||{};
    const learnedSalesChannel=String(learning?.sales_learning?.best_channel?.channel||"");
    const score=Number(lead.score||0);
    const hasContact=Boolean(clean(lead.email,250)||clean(lead.phone,80));
    const canContact=Boolean(hasContact&&lead.contact_consent_at);
    const isOutboundResearch=String(lead.source||"")==="reception_ai_outbound_research";
    const intent=String(lead.qualification?.intent||"");
    const funnelStage=String(lead.qualification?.funnel_stage||"");
    const temperature=score>=80?"hot":score>=60?"warm":"cold";
    const stage=funnelStage==="onboarding_started"?"onboarding":funnelStage==="demo_requested"||intent==="reception_ai_demo"?"demo_requested":intent==="appointment"?"decision":lead.status==="follow_up"?"follow_up":score>=70?"qualified":lead.status||"new";
    const fallbackChannel=cfg.preferred_channel==="email"&&lead.email?"e-mail":cfg.preferred_channel==="phone"&&lead.phone?"telefoon":cfg.preferred_channel==="whatsapp"&&lead.phone?"whatsapp":cfg.preferred_channel==="auto"&&learnedSalesChannel==="email"&&lead.email?"e-mail":cfg.preferred_channel==="auto"&&learnedSalesChannel==="whatsapp"&&lead.phone?"whatsapp":lead.phone?"telefoon":lead.email?"e-mail":"CRM";
    const displayName=lead.name&&lead.name!=="Websitebezoeker"?lead.name:"";
    const fallbackMessage=hasContact?("Hallo"+(displayName?" "+displayName:"")+", bedankt voor uw interesse in "+commercialName+". Ik volg uw aanvraag graag persoonlijk op. Wat is voor u de belangrijkste volgende stap?"):"";
    const fallback={
      temperature,stage,confidence:Math.min(95,Math.max(45,score)),
      next_action:!hasContact
        ?"Verzamel eerst e-mail of telefoonnummer"
        :isOutboundResearch&&!lead.contact_consent_at
          ?"Beoordeel deze onderzoeksprospect handmatig; geen automatische outreach"
          :score>=80?"Neem vandaag persoonlijk contact op":score>=60?"Volg binnen 24 uur persoonlijk op":"Kwalificeer eerst de behoefte",
      reason:!hasContact
        ?"De lead is interessant maar niet rechtstreeks opvolgbaar."
        :isOutboundResearch&&!lead.contact_consent_at
          ?"Deze prospect komt uit outbound research. De automatisering heeft geen contacttoestemming en mag daarom niet zelf extern opvolgen."
          :"De CRM-score en recente klantvraag bepalen de prioriteit.",
      channel:fallbackChannel,
      message:fallbackMessage,
      objection:"",
      missing_info:!hasContact?["contactgegevens"]:[],
      can_contact:canContact
    };

    let result:any=fallback;
    const key=Deno.env.get("GEMINI_API_KEY");
    if(key){
      const prompt=[
        "Je bent "+(cfg.name||"Sales Agent")+", een commerciële assistent van "+commercialName+".",
        "Geef uitsluitend geldige JSON met keys temperature,stage,confidence,next_action,reason,channel,message,objection,missing_info.",
        "temperature is cold, warm of hot. confidence is 0-100. channel is alleen telefoon, e-mail, whatsapp of CRM.",
        "Gebruik uitsluitend de verstrekte feiten. Verzin geen prijzen, kortingen, beschikbaarheid, garanties of klantbeloften.",
        "Geen manipulatieve druk. Het bericht moet kort, menselijk en behulpzaam zijn.",
        "Als e-mail en telefoon ontbreken: channel=CRM, message leeg, en missing_info bevat contactgegevens.",
        "Als contact_consent_at ontbreekt, mag het voorstel wel worden gemaakt maar vermeld in reason dat automatische externe opvolging niet is toegestaan.",
        "Als source reception_ai_outbound_research is en contact_consent_at ontbreekt: next_action moet een handmatige prospectbeoordeling zijn, niet automatisch contact opnemen.",
        "Salesdoel: "+(cfg.objective||"niet ingesteld"),
        "Aanbod/context: "+(cfg.offer||"niet ingesteld"),
        "Tone of voice: "+(cfg.tone||"menselijk, professioneel en compact"),
        "Extra instructies: "+(cfg.instructions||""),
        "Historische commerciële performance (alleen gebruiken als er voldoende data is): "+JSON.stringify(learning),
        "Commercieel aanbod: "+JSON.stringify({brand:commercialName,description:productContext,services:productServices,custom_instructions:profile.custom_instructions}),
        "Lead: "+JSON.stringify(lead),
        "Gesprek: "+JSON.stringify(messages.slice(-20))
      ].join("\n");

      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
      try{
        const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{
          method:"POST",signal:controller.signal,
          headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
          body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.2,maxOutputTokens:750,responseMimeType:"application/json"}})
        });
        if(ai.ok){
          const raw=await ai.json();
          const parsed=parseJsonLoose(raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"{}");
          if(parsed?.next_action){
            result={
              temperature:["cold","warm","hot"].includes(parsed.temperature)?parsed.temperature:fallback.temperature,
              stage:clean(parsed.stage,80)||fallback.stage,
              confidence:Math.min(100,Math.max(0,Number(parsed.confidence||fallback.confidence))),
              next_action:clean(parsed.next_action,500),
              reason:clean(parsed.reason,1000),
              channel:["telefoon","e-mail","whatsapp","CRM"].includes(parsed.channel)?parsed.channel:fallback.channel,
              message:clean(parsed.message,1800),
              objection:clean(parsed.objection,800),
              missing_info:arr(parsed.missing_info).map((x:any)=>clean(x,160)).filter(Boolean).slice(0,10),
              can_contact:canContact
            };
          }
        }else console.error("SALES_AGENT provider",ai.status);
      }catch(e){console.error("SALES_AGENT ai",e instanceof Error?e.message:String(e))}
      finally{clearTimeout(timer)}
    }

    let taskId:string|null=null;
    let workflowActionId:string|null=null;
    if(mode==="create_task"){
      if(!cfg.active)return json({error:"sales_agent_inactive",analysis:result},409);
      if(score<Number(cfg.min_score||60))return json({error:"below_score_threshold",score,min_score:Number(cfg.min_score||60),analysis:result},409);
      const existing=await admin.from("tasks").select("id").eq("organization_id",mem.organization_id).eq("lead_id",lead.id).eq("status","open").ilike("title","Sales Agent:%").limit(1);
      taskId=existing.data?.[0]?.id||null;
      if(!taskId){
        const who=displayName||(lead.email||lead.phone||"prospect");
        const priority=score>=80?"urgent":score>=60?"high":"normal";
        const dueHours=Math.max(1,Math.min(720,Number(cfg.follow_up_due_hours||24)));
        const title="Sales Agent: "+clean(result.next_action,180)+" – "+clean(who,100);
        const {data:task,error}=await admin.from("tasks").insert({
          organization_id:mem.organization_id,lead_id:lead.id,title,
          status:"open",priority,due_at:new Date(Date.now()+dueHours*3600000).toISOString()
        }).select("id").single();
        if(error)throw error;taskId=task.id;
      }
      await admin.from("leads").update({status:"follow_up",updated_at:new Date().toISOString()}).eq("id",lead.id).eq("organization_id",mem.organization_id);
    }

    if(mode==="queue_outreach"){
      if(!cfg.active)return json({error:"sales_agent_inactive",analysis:result},409);
      if(score<Number(cfg.min_score||60))return json({error:"below_score_threshold",score,min_score:Number(cfg.min_score||60),analysis:result},409);
      if(!canContact)return json({error:"contact_consent_required",analysis:result},409);
      if(!result.message)return json({error:"message_missing",analysis:result},409);

      const {data:integrations}=await admin.from("tenant_integrations").select("channel,status,capabilities")
        .eq("organization_id",mem.organization_id).eq("is_default",true).eq("status","active").in("channel",["email","whatsapp"]);
      const emailReady=Boolean(lead.email&&(integrations||[]).some((x:any)=>x.channel==="email"&&Array.isArray(x.capabilities)&&x.capabilities.includes("lead_follow_up")));
      const waReady=Boolean(lead.phone&&(integrations||[]).some((x:any)=>x.channel==="whatsapp"&&Array.isArray(x.capabilities)&&x.capabilities.includes("lead_follow_up")));
      let workflowChannel="";
      if(result.channel==="e-mail"&&emailReady)workflowChannel="email";
      else if(result.channel==="whatsapp"&&waReady)workflowChannel="whatsapp";
      else if(emailReady)workflowChannel="email";
      else if(waReady)workflowChannel="whatsapp";
      if(!workflowChannel)return json({error:"delivery_channel_unavailable",analysis:result},409);

      const day=new Date().toISOString().slice(0,10);
      const idempotencyKey="sales:"+lead.id+":followup:"+day;
      const {data:wa,error:we}=await admin.from("workflow_actions").upsert({
        organization_id:mem.organization_id,
        lead_id:lead.id,
        action_type:"lead_follow_up",
        channel:workflowChannel,
        status:"pending",
        priority:score>=80?"high":"normal",
        idempotency_key:idempotencyKey,
        payload:{
          source:"sales_agent",
          explicit_user_action:true,
          custom_message:clean(result.message,1800),
          subject:"Uw aanvraag bij "+commercialName,
          sales_temperature:result.temperature,
          sales_stage:result.stage
        },
        scheduled_at:new Date().toISOString()
      },{onConflict:"idempotency_key",ignoreDuplicates:true}).select("id").maybeSingle();
      if(we)throw we;
      workflowActionId=wa?.id||null;
      await admin.from("leads").update({status:"follow_up",updated_at:new Date().toISOString()}).eq("id",lead.id).eq("organization_id",mem.organization_id);
    }

    await admin.from("sales_opportunities").upsert({
      organization_id:mem.organization_id,
      lead_id:lead.id,
      temperature:result.temperature,
      stage:result.stage,
      confidence:Math.round(Number(result.confidence||0)),
      next_action:result.next_action||"",
      reason:result.reason||"",
      channel:result.channel||"CRM",
      message:result.message||"",
      objection:result.objection||"",
      missing_info:Array.isArray(result.missing_info)?result.missing_info:[],
      can_contact:canContact,
      analyzed_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    },{onConflict:"organization_id,lead_id"});

    await admin.from("audit_events").insert({
      organization_id:mem.organization_id,actor_user_id:user.id,
      event_type:mode==="create_task"?"sales_agent.follow_up_task_created":mode==="queue_outreach"?"sales_agent.outreach_queued":"sales_agent.analysis_generated",
      entity_type:"lead",entity_id:lead.id,
      payload:{temperature:result.temperature,stage:result.stage,confidence:result.confidence,channel:result.channel,can_contact:canContact,task_id:taskId,workflow_action_id:workflowActionId}
    });

    return json({ok:true,mode,task_id:taskId,workflow_action_id:workflowActionId,config_active:cfg.active===true,...result});
  }catch(e){
    console.error("SALES_AGENT",e);
    return json({error:"internal_error"},500);
  }
});
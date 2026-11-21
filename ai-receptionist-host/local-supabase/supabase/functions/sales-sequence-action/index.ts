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
    const {data:mem}=await uc.from("memberships").select("organization_id,role").eq("user_id",user.id).eq("active",true).single();
    if(!mem)return J({error:"forbidden"},403);

    const {data:org}=await admin.from("organizations")
      .select("plan,subscription_status,trial_ends_at,is_internal")
      .eq("id",mem.organization_id)
      .single();
    const trialOk=org?.is_internal===true||(org?.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
    const paidOk=org?.plan==="business"&&["active","trialing"].includes(String(org?.subscription_status||""));
    if(!trialOk&&!paidOk)return J({error:"upgrade_required"},402);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"create");

    if(action==="create"){
      const leadId=clean(body.lead_id,80);
      if(!leadId)return J({error:"lead_required"},400);

      const [{data:lead},{data:profile},{data:cfg},{data:integrations}]=await Promise.all([
        admin.from("leads").select("id,name,email,phone,status,score,summary,qualification,contact_consent_at").eq("id",leadId).eq("organization_id",mem.organization_id).single(),
        admin.from("business_profiles").select("business_name,description,services,custom_instructions").eq("organization_id",mem.organization_id).single(),
        admin.from("sales_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle(),
        admin.from("tenant_integrations").select("channel,status,capabilities").eq("organization_id",mem.organization_id).eq("is_default",true).eq("status","active").in("channel",["email","whatsapp"])
      ]);
      if(!lead)return J({error:"lead_not_found"},404);
      if(!profile)return J({error:"profile_not_found"},404);
      if(!cfg?.active)return J({error:"sales_agent_inactive"},409);
      if(["won","lost"].includes(String(lead.status||"")))return J({error:"lead_closed"},409);
      if(Number(lead.score||0)<Number(cfg.min_score||60))return J({error:"below_score_threshold"},409);
      if(!lead.contact_consent_at)return J({error:"contact_consent_required"},409);

      const commercialName=clean(cfg.brand_name,120)||profile.business_name;
      const productContext=clean(cfg.product_context,2400)||profile.description||"";
      const productServices=arr(cfg.product_services).length?arr(cfg.product_services):arr(profile.services);

      const emailReady=Boolean(lead.email&&(integrations||[]).some((x:any)=>x.channel==="email"&&arr(x.capabilities).includes("lead_follow_up")));
      const waReady=Boolean(lead.phone&&(integrations||[]).some((x:any)=>x.channel==="whatsapp"&&arr(x.capabilities).includes("lead_follow_up")));
      let channel="";
      if(cfg.preferred_channel==="email"&&emailReady)channel="email";
      else if(cfg.preferred_channel==="whatsapp"&&waReady)channel="whatsapp";
      else if(emailReady)channel="email";
      else if(waReady)channel="whatsapp";
      if(!channel)return J({error:"delivery_channel_unavailable"},409);

      const {data:existing}=await admin.from("sales_sequences").select("id,status").eq("organization_id",mem.organization_id).eq("lead_id",lead.id).in("status",["active","paused"]).limit(1);
      if(existing?.length)return J({error:"sequence_already_active",sequence_id:existing[0].id},409);

      const displayName=lead.name&&lead.name!=="Websitebezoeker"?lead.name:"";
      const fallback=[
        "Hallo"+(displayName?" "+displayName:"")+", bedankt voor uw interesse in "+commercialName+". Ik volg uw aanvraag graag persoonlijk op. Wat is voor u de belangrijkste volgende stap?",
        "Hallo"+(displayName?" "+displayName:"")+", ik kom nog even terug op uw aanvraag bij "+commercialName+". Is uw vraag nog actueel, of kan ik ergens mee helpen om de volgende stap duidelijk te maken?",
        "Hallo"+(displayName?" "+displayName:"")+", ik wilde uw aanvraag nog één keer kort opvolgen. Als dit momenteel niet meer nodig is, is dat uiteraard helemaal prima. Laat gerust weten wanneer we later kunnen helpen."
      ];

      let messages=fallback;
      const key=Deno.env.get("GEMINI_API_KEY");
      if(key){
        const prompt=[
          "Je bent de Sales Agent van "+commercialName+".",
          "Maak exact 3 korte follow-upberichten in natuurlijk Nederlands voor één warme lead.",
          "Geef uitsluitend JSON met key messages; messages is een array van exact 3 strings.",
          "Stap 1 is directe persoonlijke opvolging, stap 2 is een vriendelijke reminder na 2 dagen, stap 3 sluit de opvolging na 5 dagen rustig af.",
          "Geen druk, schaarste, verzonnen prijzen, kortingen, beschikbaarheid, garanties of beloftes.",
          "Gebruik alleen echte feiten uit de context.",
          "Tone: "+(cfg.tone||"menselijk, professioneel en compact"),
          "Salesdoel: "+(cfg.objective||""),
          "Aanbod/context: "+(cfg.offer||""),
          "Commercieel aanbod: "+JSON.stringify({brand:commercialName,description:productContext,services:productServices,custom_instructions:profile.custom_instructions}),
          "Lead: "+JSON.stringify({name:lead.name,summary:lead.summary,qualification:lead.qualification,score:lead.score})
        ].join("\n");
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
        try{
          const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
            method:"POST",signal:controller.signal,
            headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
            body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.3,maxOutputTokens:1000,responseMimeType:"application/json"}})
          });
          if(ai.ok){
            const raw=await ai.json();
            const parsed=JSON.parse(raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"{}");
            const m=arr(parsed?.messages).map((x:any)=>clean(x,1800)).filter(Boolean).slice(0,3);
            if(m.length===3)messages=m;
          }
        }catch(e){console.error("SALES_SEQUENCE ai",e instanceof Error?e.message:String(e))}
        finally{clearTimeout(timer)}
      }

      const {data:sequence,error:se}=await admin.from("sales_sequences").insert({
        organization_id:mem.organization_id,lead_id:lead.id,status:"active",
        objective:clean(cfg.objective||"Warme lead persoonlijk opvolgen",800),
        current_step:1,created_by:user.id
      }).select("id").single();
      if(se)throw se;

      const offsets=[0,48,120];
      const rows=messages.map((message:string,i:number)=>({
        sequence_id:sequence.id,organization_id:mem.organization_id,lead_id:lead.id,step_no:i+1,
        due_at:new Date(Date.now()+offsets[i]*3600000).toISOString(),channel,message,status:"planned",requires_approval:true
      }));
      const {data:steps,error:ste}=await admin.from("sales_sequence_steps").insert(rows).select("*");
      if(ste)throw ste;

      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"sales_sequence.created",
        entity_type:"sales_sequence",entity_id:sequence.id,payload:{lead_id:lead.id,steps:3,channel}
      });

      return J({ok:true,sequence_id:sequence.id,steps});
    }

    if(action==="approve_step"){
      const stepId=clean(body.step_id,80);
      if(!stepId)return J({error:"step_required"},400);
      const {data:step}=await admin.from("sales_sequence_steps").select("*,sales_sequences(status)").eq("id",stepId).eq("organization_id",mem.organization_id).single();
      if(!step)return J({error:"step_not_found"},404);
      if(step.status==="queued"&&step.workflow_action_id)return J({ok:true,workflow_action_id:step.workflow_action_id,already_queued:true});
      if(!["planned","approved"].includes(step.status))return J({error:"step_not_approvable"},409);
      if(step.sales_sequences?.status!=="active")return J({error:"sequence_not_active"},409);

      const [{data:lead},{data:profile},{data:salesCfg},{data:integration}]=await Promise.all([
        admin.from("leads").select("id,email,phone,status,score,contact_consent_at").eq("id",step.lead_id).eq("organization_id",mem.organization_id).single(),
        admin.from("business_profiles").select("business_name").eq("organization_id",mem.organization_id).single(),
        admin.from("sales_agent_configs").select("brand_name").eq("organization_id",mem.organization_id).maybeSingle(),
        admin.from("tenant_integrations").select("channel,status,capabilities").eq("organization_id",mem.organization_id).eq("channel",step.channel).eq("is_default",true).maybeSingle()
      ]);
      const approvalBrand=clean(salesCfg?.brand_name,120)||profile?.business_name||"ons bedrijf";
      if(!lead)return J({error:"lead_not_found"},404);
      if(["won","lost"].includes(String(lead.status||"")))return J({error:"lead_closed"},409);
      if(!lead.contact_consent_at)return J({error:"contact_consent_required"},409);
      if(step.channel==="email"&&!lead.email)return J({error:"email_missing"},409);
      if(step.channel==="whatsapp"&&!lead.phone)return J({error:"phone_missing"},409);
      if(!integration||integration.status!=="active"||!arr(integration.capabilities).includes("lead_follow_up"))return J({error:"delivery_channel_unavailable"},409);

      const scheduledAt=new Date(Math.max(Date.now(),new Date(step.due_at).getTime())).toISOString();
      const idempotencyKey="sales-sequence-step:"+step.id;
      const {data:wa,error:we}=await admin.from("workflow_actions").upsert({
        organization_id:mem.organization_id,lead_id:lead.id,action_type:"lead_follow_up",
        channel:step.channel,status:"pending",priority:Number(lead.score||0)>=80?"high":"normal",
        idempotency_key:idempotencyKey,
        payload:{
          source:"sales_sequence",
          explicit_user_action:true,
          sales_sequence_id:step.sequence_id,
          sales_sequence_step_id:step.id,
          sales_sequence_step_no:step.step_no,
          custom_message:clean(step.message,1800),
          subject:"Uw aanvraag bij "+approvalBrand
        },
        scheduled_at:scheduledAt
      },{onConflict:"idempotency_key"}).select("id").single();
      if(we)throw we;

      await admin.from("sales_sequence_steps").update({status:"queued",workflow_action_id:wa.id,updated_at:new Date().toISOString()}).eq("id",step.id).eq("organization_id",mem.organization_id);
      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"sales_sequence.step_approved",
        entity_type:"sales_sequence_step",entity_id:step.id,payload:{workflow_action_id:wa.id,scheduled_at:scheduledAt}
      });

      return J({ok:true,workflow_action_id:wa.id,scheduled_at:scheduledAt});
    }

    if(action==="pause"||action==="resume"||action==="cancel"){
      const sequenceId=clean(body.sequence_id,80);
      if(!sequenceId)return J({error:"sequence_required"},400);
      const target=action==="pause"?"paused":action==="resume"?"active":"cancelled";
      const {data:seq,error:e}=await admin.from("sales_sequences").update({status:target,updated_at:new Date().toISOString()})
        .eq("id",sequenceId).eq("organization_id",mem.organization_id).select("id,status").single();
      if(e)throw e;
      if(action==="cancel"){
        await admin.from("sales_sequence_steps").update({status:"cancelled",updated_at:new Date().toISOString()})
          .eq("sequence_id",sequenceId).eq("organization_id",mem.organization_id).in("status",["planned","approved"]);
      }
      return J({ok:true,...seq});
    }

    return J({error:"unknown_action"},400);
  }catch(e){
    console.error("SALES_SEQUENCE",e);
    return J({error:"internal_error"},500);
  }
});
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={"Content-Type":"application/json"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);
const arr=(v:any)=>Array.isArray(v)?v:[];

function dueIso(hours:number){
  return new Date(Date.now()+Math.max(1,Math.min(720,hours))*3600000).toISOString();
}
async function hasBusinessEntitlement(db:any,organizationId:string){
  const {data:org}=await db.from("organizations")
    .select("plan,subscription_status,trial_ends_at,is_internal")
    .eq("id",organizationId).maybeSingle();
  if(!org)return false;
  if(org.is_internal===true)return true;
  if(org.plan==="trial"&&org.trial_ends_at&&new Date(org.trial_ends_at).getTime()>Date.now())return true;
  return org.plan==="business"&&["active","trialing"].includes(String(org.subscription_status||""));
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const runnerToken=req.headers.get("x-runner-token")||"";
    if(!runnerToken)return J({error:"unauthorized"},401);
    const {data:valid,error:tokenError}=await db.rpc("validate_workflow_runner_token",{p_token:runnerToken});
    if(tokenError||valid!==true)return J({error:"unauthorized"},401);

    const now=new Date().toISOString();
    const report:any={sales:{organizations:0,tasks_created:0},marketing:{organizations:0,drafts_created:0},onboarding:{claimed_checked:0,pilot_live:0,value_events:0,value_proven:0,conversion_ready:0,stalled_tasks:0,no_usage_tasks:0,pilot_optimization_tasks:0,trial_expiry_tasks:0},customer_success:{checked:0,healthy:0,attention:0,critical:0,tasks_created:0},learning:{snapshots_created:0},errors:[]};
    const learningOrgIds=new Set<string>();

    const {data:salesConfigs,error:salesCfgErr}=await db.from("sales_agent_configs")
      .select("*").eq("active",true).eq("auto_triage",true).limit(100);
    if(salesCfgErr)throw salesCfgErr;

    for(const cfg of salesConfigs||[]){
      try{
        if(!await hasBusinessEntitlement(db,String(cfg.organization_id)))continue;
        report.sales.organizations++;learningOrgIds.add(String(cfg.organization_id));
        const minScore=Number(cfg.min_score||60);
        const [{data:leads},{data:openTasks}]=await Promise.all([
          db.from("leads").select("id,name,email,phone,status,score,summary,qualification,contact_consent_at")
            .eq("organization_id",cfg.organization_id)
            .gte("score",minScore)
            .not("status","in","(won,lost)")
            .order("score",{ascending:false}).limit(40),
          db.from("tasks").select("id,lead_id,title,status")
            .eq("organization_id",cfg.organization_id)
            .eq("status","open")
            .ilike("title","Sales Agent:%")
        ]);

        const taskLeadIds=new Set((openTasks||[]).map((t:any)=>t.lead_id).filter(Boolean));
        let created=0;
        for(const lead of leads||[]){
          const score=Number(lead.score||0);
          const hasContact=Boolean(clean(lead.email,250)||clean(lead.phone,80));
          const canContact=Boolean(hasContact&&lead.contact_consent_at);
          const intent=String(lead.qualification?.intent||"");
          const funnelStage=String(lead.qualification?.funnel_stage||"");
          const temperature=score>=80?"hot":score>=60?"warm":"cold";
          const stage=funnelStage==="onboarding_started"?"onboarding":funnelStage==="demo_requested"||intent==="reception_ai_demo"?"demo_requested":intent==="appointment"?"decision":lead.status==="follow_up"?"follow_up":score>=70?"qualified":lead.status||"new";
          const channel=lead.phone?"telefoon":lead.email?"e-mail":"CRM";
          const nextAction=!hasContact?"Verzamel eerst e-mail of telefoonnummer":score>=80?"Neem vandaag persoonlijk contact op":"Volg binnen 24 uur persoonlijk op";
          const reason=!hasContact
            ?"Deze warme lead mist nog bruikbare contactgegevens."
            :!lead.contact_consent_at
              ?"Contactgegevens zijn aanwezig, maar automatische externe opvolging is niet toegestaan zonder contacttoestemming."
              :"CRM-score en klantintentie maken dit een prioritaire verkoopkans.";

          await db.from("sales_opportunities").upsert({
            organization_id:cfg.organization_id,
            lead_id:lead.id,
            temperature,
            stage,
            confidence:Math.min(95,Math.max(45,score)),
            next_action:nextAction,
            reason,
            channel,
            message:"",
            objection:"",
            missing_info:!hasContact?["contactgegevens"]:[],
            can_contact:canContact,
            analyzed_at:now,
            updated_at:now
          },{onConflict:"organization_id,lead_id"});

          if(taskLeadIds.has(lead.id))continue;
          const who=lead.name&&lead.name!=="Websitebezoeker"?lead.name:(lead.email||lead.phone||"websitebezoeker");
          const action=hasContact?"persoonlijk opvolgen":"contactgegevens verzamelen";
          const priority=score>=80?"urgent":"high";
          const {error}=await db.from("tasks").insert({
            organization_id:cfg.organization_id,
            lead_id:lead.id,
            title:"Sales Agent: "+action+" – "+clean(who,120),
            status:"open",
            priority,
            due_at:dueIso(Number(cfg.follow_up_due_hours||24))
          });
          if(error){report.errors.push({agent:"sales",organization_id:cfg.organization_id,lead_id:lead.id,error:error.message});continue}
          created++; report.sales.tasks_created++;
        }

        await db.from("sales_agent_configs").update({last_run_at:now,updated_at:now}).eq("organization_id",cfg.organization_id);
        if(created){
          await db.from("audit_events").insert({
            organization_id:cfg.organization_id,actor_user_id:null,
            event_type:"sales_agent.auto_triage_run",entity_type:"organization",entity_id:cfg.organization_id,
            payload:{tasks_created:created,min_score:minScore}
          });
        }
      }catch(e){
        report.errors.push({agent:"sales",organization_id:cfg.organization_id,error:e instanceof Error?e.message:String(e)});
      }
    }

    const {data:marketingConfigs,error:marketingCfgErr}=await db.from("marketing_agent_configs")
      .select("*").eq("active",true).eq("auto_drafts",true).limit(100);
    if(marketingCfgErr)throw marketingCfgErr;

    const key=Deno.env.get("GEMINI_API_KEY");

    for(const cfg of marketingConfigs||[]){
      try{
        if(!await hasBusinessEntitlement(db,String(cfg.organization_id)))continue;
        report.marketing.organizations++;learningOrgIds.add(String(cfg.organization_id));
        const cadence=Math.max(1,Math.min(21,Number(cfg.cadence_per_week||3)));
        const minHours=Math.max(8,Math.floor(168/cadence));
        const {data:lastCampaign}=await db.from("marketing_campaigns")
          .select("created_at").eq("organization_id",cfg.organization_id)
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(lastCampaign?.created_at){
          const ageHours=(Date.now()-new Date(lastCampaign.created_at).getTime())/3600000;
          if(ageHours<minHours){
            await db.from("marketing_agent_configs").update({last_run_at:now,updated_at:now}).eq("organization_id",cfg.organization_id);
            continue;
          }
        }

        const [{data:profile},{data:leads},{count:campaignCount},{data:learningRows}]=await Promise.all([
          db.from("business_profiles").select("business_name,description,services,custom_instructions").eq("organization_id",cfg.organization_id).single(),
          db.from("leads").select("status,score,source,summary,created_at").eq("organization_id",cfg.organization_id)
            .order("created_at",{ascending:false}).limit(30),
          db.from("marketing_campaigns").select("id",{count:"exact",head:true}).eq("organization_id",cfg.organization_id),
          db.from("commercial_learning_snapshots").select("metrics").eq("organization_id",cfg.organization_id).order("created_at",{ascending:false}).limit(1)
        ]);
        if(!profile)continue;

        const learning=learningRows?.[0]?.metrics||{};
        const commercialName=clean(cfg.brand_name,120)||profile.business_name;
        const productContext=clean(cfg.product_context,2400)||profile.description||"";
        const productServices=arr(cfg.product_services).length?arr(cfg.product_services):arr(profile.services);
        const channels=arr(cfg.channels).length?arr(cfg.channels):["facebook","instagram"];
        const channel=String(channels[Number(campaignCount||0)%channels.length]||"facebook");
        const L=leads||[];
        const hot=L.filter((x:any)=>(x.score||0)>=70&&!["won","lost"].includes(x.status)).length;
        const services=productServices.map((x:any)=>clean(x,180)).filter(Boolean);
        const stats={recent:L.length,hot};
        const fallback={
          objective:hot?"Ondersteun bestaande warme leads":"Genereer nieuwe relevante aanvragen",
          audience:clean(cfg.target_audience,700)||"Prospects met behoefte aan "+(services.slice(0,2).join(" en ")||"de aangeboden diensten"),
          channel,
          hook:commercialName+" helpt u met "+(services[0]||"een duidelijke volgende stap")+".",
          content:"Op zoek naar "+(services.slice(0,3).join(", ")||"een betrouwbare oplossing")+"? "+commercialName+" helpt u met duidelijke informatie en een passende volgende stap.",
          cta:clean(cfg.call_to_action,500)||"Neem contact op voor meer informatie",
          rationale:hot?"Er zijn al warme leads; deze content ondersteunt de huidige vraag.":"Nieuwe relevante instroom is nu de belangrijkste marketingkans."
        };

        let result:any=fallback;
        if(key){
          const prompt=[
            "Je bent de Marketing Agent van "+commercialName+".",
            "Geef uitsluitend JSON met objective,audience,hook,content,cta,rationale.",
            "Schrijf bruikbare organische content in natuurlijk Nederlands voor "+channel+".",
            "Gebruik alleen verstrekte feiten. Verzin geen prijzen, kortingen, reviews, garanties, certificaten of beschikbaarheid.",
            "Geen clickbait. Geen externe publicatie; dit is alleen een interne draft.",
            "Doelgroep: "+clean(cfg.target_audience,1200),
            "Positionering: "+clean(cfg.positioning,1200),
            "Contentpijlers: "+JSON.stringify(arr(cfg.content_pillars)),
            "Tone: "+clean(cfg.tone,500),
            "CTA: "+clean(cfg.call_to_action,500),
            "Extra instructies: "+clean(cfg.instructions,2500),
            "Commercieel aanbod: "+JSON.stringify({brand:commercialName,description:productContext,services,custom_instructions:profile.custom_instructions}),
            "CRM signalen: "+JSON.stringify(stats),
            "Recente klantvragen: "+JSON.stringify(L.slice(0,10).map((x:any)=>x.summary).filter(Boolean)),
            "Historische campagneperformance: "+JSON.stringify(learning)
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
              if(x?.content&&x?.hook)result={
                objective:clean(x.objective,600)||fallback.objective,
                audience:clean(x.audience,700)||fallback.audience,
                channel,
                hook:clean(x.hook,600),
                content:clean(x.content,4000),
                cta:clean(x.cta,500)||fallback.cta,
                rationale:clean(x.rationale,1200)
              };
            }else console.error("COMMERCIAL_MARKETING provider",ai.status);
          }catch(e){console.error("COMMERCIAL_MARKETING ai",e instanceof Error?e.message:String(e))}
          finally{clearTimeout(timer)}
        }

        const {data:campaign,error:campaignErr}=await db.from("marketing_campaigns").insert({
          organization_id:cfg.organization_id,status:"draft",
          objective:result.objective,audience:result.audience,channel:result.channel,
          hook:result.hook,content:result.content,cta:result.cta,rationale:result.rationale,
          source_signals:{auto:true,stats,cadence_per_week:cadence},created_by:null
        }).select("id").single();
        if(campaignErr)throw campaignErr;
        report.marketing.drafts_created++;

        await db.from("marketing_agent_configs").update({last_run_at:now,updated_at:now}).eq("organization_id",cfg.organization_id);
        await db.from("audit_events").insert({
          organization_id:cfg.organization_id,actor_user_id:null,
          event_type:"marketing_agent.auto_draft_created",entity_type:"marketing_campaign",entity_id:campaign.id,
          payload:{channel:result.channel,objective:result.objective,cadence_per_week:cadence}
        });
      }catch(e){
        report.errors.push({agent:"marketing",organization_id:cfg.organization_id,error:e instanceof Error?e.message:String(e)});
      }
    }

    const {data:claimedInvites,error:claimedErr}=await db.from("sales_onboarding_invites")
      .select("id,lead_id,sales_organization_id,claimed_organization_id,claimed_at,requested_plan,status")
      .eq("status","claimed")
      .not("claimed_organization_id","is",null)
      .order("claimed_at",{ascending:true})
      .limit(100);
    if(claimedErr)report.errors.push({agent:"onboarding",error:claimedErr.message});

    for(const invite of claimedInvites||[]){
      try{
        report.onboarding.claimed_checked++;
        const [{data:progress,error:progressErr},{data:activation,error:activationErr},{data:pilotValue,error:pilotValueErr}]=await Promise.all([
          db.rpc("compute_tenant_onboarding_progress",{p_organization_id:invite.claimed_organization_id}),
          db.rpc("compute_trial_activation_metrics",{p_organization_id:invite.claimed_organization_id}),
          db.rpc("compute_pilot_value_metrics",{p_organization_id:invite.claimed_organization_id,p_period_days:14})
        ]);
        if(progressErr)throw progressErr;
        if(activationErr)throw activationErr;
        if(pilotValueErr)throw pilotValueErr;
        const {data:lead}=await db.from("leads").select("name,email,phone,qualification,status")
          .eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id).single();
        const who=clean(lead?.name||lead?.email||lead?.phone||"prospect",120);
        const {data:opp}=await db.from("sales_opportunities").select("stage")
          .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id).maybeSingle();

        if(progress?.core_ready){
          if(progress?.organization_status==="onboarding"){
            await db.from("organizations").update({status:"active",updated_at:now}).eq("id",invite.claimed_organization_id).eq("status","onboarding");
          }
          const activationStage=String(activation?.stage||"not_started");
          const conversionReady=pilotValue?.conversion_ready===true;
          const funnelStage=activationStage==="value_proven"?"value_proven":conversionReady?"conversion_ready":activationStage==="value_event"?"value_event":"pilot_live";
          if(lead){
            await db.from("leads").update({
              qualification:{...(lead.qualification||{}),funnel_stage:funnelStage,onboarding_core_completed_at:lead.qualification?.onboarding_core_completed_at||now,trial_activation_score:Number(activation?.score||0),trial_activation_stage:activationStage,pilot_value_score:Number(pilotValue?.score||0),pilot_conversion_ready:conversionReady},
              updated_at:now
            }).eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id);
          }

          const nextAction=activationStage==="value_proven"||conversionReady
            ?"De pilot toont voldoende echte waarde. Bespreek nu het passende betaalde plan en de productie-uitrol."
            :activationStage==="value_event"
              ?"Eerste echte waarde is zichtbaar. Volg persoonlijk op, verzamel feedback en stuur naar een tweede waarde-event."
              :"Volg de eerste echte resultaten tijdens de pilot op.";
          const reason=activationStage==="value_proven"
            ?"Meerdere echte waarde-events zijn geregistreerd tijdens de pilot."
            :conversionReady
              ?"De pilot value score is "+String(pilotValue?.score||0)+"/100 en bevat voldoende gebruik plus commerciële intentie."
              :activationStage==="value_event"
                ?"De eerste echte waarde is geregistreerd tijdens de pilot."
                :"De kernonboarding is voltooid; Reception AI is klaar voor echte bezoekers.";

          await db.from("sales_opportunities").update({
            stage:funnelStage,confidence:activationStage==="value_proven"?100:99,
            next_action:nextAction,
            reason,
            updated_at:now,analyzed_at:now
          }).eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id);

          if(opp?.stage!=="pilot_live"&&opp?.stage!=="value_event"&&opp?.stage!=="value_proven"){
            report.onboarding.pilot_live++;
            await db.from("audit_events").insert({
              organization_id:invite.sales_organization_id,actor_user_id:null,event_type:"sales_onboarding.pilot_live",
              entity_type:"lead",entity_id:invite.lead_id,
              payload:{invite_id:invite.id,claimed_organization_id:invite.claimed_organization_id,source:"commercial_agent_runner"}
            });
          }

          if(activationStage==="value_event"&&opp?.stage!=="value_event"&&opp?.stage!=="value_proven"){
            report.onboarding.value_events++;
            await db.from("audit_events").insert({
              organization_id:invite.sales_organization_id,actor_user_id:null,event_type:"sales_onboarding.value_event",
              entity_type:"lead",entity_id:invite.lead_id,
              payload:{invite_id:invite.id,activation_score:activation?.score||0,value_event_count:activation?.value_event_count||0}
            });
          }

          if(activationStage==="value_proven"&&opp?.stage!=="value_proven"){
            report.onboarding.value_proven++;
            await db.from("audit_events").insert({
              organization_id:invite.sales_organization_id,actor_user_id:null,event_type:"sales_onboarding.value_proven",
              entity_type:"lead",entity_id:invite.lead_id,
              payload:{invite_id:invite.id,activation_score:activation?.score||0,value_event_count:activation?.value_event_count||0}
            });
          }
          if(conversionReady&&!["conversion_ready","value_proven"].includes(String(opp?.stage||""))){
            report.onboarding.conversion_ready++;
            await db.from("audit_events").insert({
              organization_id:invite.sales_organization_id,actor_user_id:null,event_type:"sales_onboarding.conversion_ready",
              entity_type:"lead",entity_id:invite.lead_id,
              payload:{invite_id:invite.id,pilot_value_score:pilotValue?.score||0,signal:pilotValue?.signal||""}
            });
          }

          const taskTitle=activationStage==="value_proven"||conversionReady
            ?"Sales Agent: conversion ready – bespreek betaald plan"
            :activationStage==="value_event"
              ?"Sales Agent: eerste waarde-event opvolgen"
              :"Sales Agent: pilotresultaten opvolgen";
          const {data:pilotTask}=await db.from("tasks").select("id")
            .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
            .eq("status","open").eq("title",taskTitle).limit(1);
          if(!pilotTask?.length){
            await db.from("tasks").insert({
              organization_id:invite.sales_organization_id,lead_id:invite.lead_id,
              title:taskTitle,status:"open",priority:(activationStage==="value_proven"||conversionReady)?"urgent":"high",
              due_at:dueIso((activationStage==="value_proven"||conversionReady)?12:activationStage==="value_event"?24:72)
            });
          }

          const pilotAgeHours=lead?.qualification?.onboarding_core_completed_at
            ?(Date.now()-new Date(lead.qualification.onboarding_core_completed_at).getTime())/3600000
            :0;
          if(pilotAgeHours>=72&&activationStage==="not_started"){
            const noUsageTitle="Sales Agent: pilot heeft nog geen echt gebruik – "+who;
            const {data:noUsageTask}=await db.from("tasks").select("id")
              .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
              .eq("status","open").eq("title",noUsageTitle).limit(1);
            if(!noUsageTask?.length){
              await db.from("tasks").insert({
                organization_id:invite.sales_organization_id,lead_id:invite.lead_id,
                title:noUsageTitle,status:"open",priority:"high",due_at:dueIso(8)
              });
              report.onboarding.no_usage_tasks++;
            }
          }

          if(pilotAgeHours>=120&&activationStage==="usage_started"){
            const optimizeTitle="Sales Agent: pilotgebruik zonder waarde-event – "+who;
            const {data:optTask}=await db.from("tasks").select("id")
              .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
              .eq("status","open").eq("title",optimizeTitle).limit(1);
            if(!optTask?.length){
              await db.from("tasks").insert({
                organization_id:invite.sales_organization_id,lead_id:invite.lead_id,
                title:optimizeTitle,status:"open",priority:"high",due_at:dueIso(8)
              });
              report.onboarding.pilot_optimization_tasks++;
            }
          }

          const trialEnd=progress?.trial_ends_at?new Date(progress.trial_ends_at).getTime():0;
          const trialHours=trialEnd?(trialEnd-Date.now())/3600000:9999;
          if(progress?.plan==="trial"&&trialHours>0&&trialHours<=72){
            const {data:expiryTask}=await db.from("tasks").select("id")
              .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
              .eq("status","open").eq("title","Sales Agent: trial loopt af – "+who).limit(1);
            if(!expiryTask?.length){
              await db.from("tasks").insert({
                organization_id:invite.sales_organization_id,lead_id:invite.lead_id,
                title:"Sales Agent: trial loopt af – "+who,status:"open",priority:"urgent",due_at:dueIso(4)
              });
              report.onboarding.trial_expiry_tasks++;
            }
          }
        }else{
          const claimedAgeHours=invite.claimed_at?(Date.now()-new Date(invite.claimed_at).getTime())/3600000:0;
          if(claimedAgeHours>=48){
            const title="Sales Agent: onboarding stagneert – "+who;
            const {data:stallTask}=await db.from("tasks").select("id")
              .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
              .eq("status","open").eq("title",title).limit(1);
            if(!stallTask?.length){
              await db.from("tasks").insert({
                organization_id:invite.sales_organization_id,lead_id:invite.lead_id,
                title,status:"open",priority:"high",due_at:dueIso(8)
              });
              report.onboarding.stalled_tasks++;
            }
            await db.from("sales_opportunities").update({
              stage:"onboarding",
              next_action:"Help de prospect met: "+clean(progress?.next_action?.label||"volgende onboardingstap",300)+".",
              reason:"De onboarding is na 48 uur nog niet kernklaar ("+String(progress?.progress_percent||0)+"%).",
              updated_at:now,analyzed_at:now
            }).eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id);
          }
        }
      }catch(e){
        report.errors.push({agent:"onboarding",invite_id:invite.id,error:e instanceof Error?e.message:String(e)});
      }
    }

    const {data:convertedInvites,error:convertedErr}=await db.from("sales_onboarding_invites")
      .select("id,lead_id,sales_organization_id,claimed_organization_id,converted_at,requested_plan,status")
      .eq("status","converted")
      .not("claimed_organization_id","is",null)
      .order("converted_at",{ascending:false})
      .limit(200);
    if(convertedErr)report.errors.push({agent:"customer_success",error:convertedErr.message});

    for(const invite of convertedInvites||[]){
      try{
        report.customer_success.checked++;
        const {data:health,error:healthErr}=await db.rpc("compute_customer_success_health",{
          p_organization_id:invite.claimed_organization_id,
          p_period_days:14
        });
        if(healthErr)throw healthErr;

        const status=String(health?.status||"unknown");
        if(status==="healthy")report.customer_success.healthy++;
        else if(status==="attention")report.customer_success.attention++;
        else if(status==="critical")report.customer_success.critical++;

        if(!["attention","critical"].includes(status))continue;

        const {data:lead}=await db.from("leads").select("name,email,phone")
          .eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id).maybeSingle();
        const who=clean(lead?.name||lead?.email||lead?.phone||"klant",120);
        const taskTitle="Customer Success: "+(status==="critical"?"URGENT – ":"")+"klantgezondheid – "+who;
        const {data:existing}=await db.from("tasks").select("id")
          .eq("organization_id",invite.sales_organization_id)
          .eq("lead_id",invite.lead_id)
          .eq("status","open")
          .eq("title",taskTitle)
          .limit(1);

        if(!existing?.length){
          await db.from("tasks").insert({
            organization_id:invite.sales_organization_id,
            lead_id:invite.lead_id,
            title:taskTitle,
            status:"open",
            priority:status==="critical"?"urgent":"high",
            due_at:dueIso(status==="critical"?4:24)
          });
          report.customer_success.tasks_created++;

          await db.from("audit_events").insert({
            organization_id:invite.sales_organization_id,
            actor_user_id:null,
            event_type:"customer_success.health_attention",
            entity_type:"lead",
            entity_id:invite.lead_id,
            payload:{
              tenant_organization_id:invite.claimed_organization_id,
              health_status:status,
              health_score:health?.score||0,
              risks:health?.risks||[],
              next_action:health?.next_action||""
            }
          });
        }

        await db.from("sales_opportunities").update({
          next_action:clean(health?.next_action||"Controleer klantgezondheid.",500),
          reason:"Customer Success health "+status+" · score "+String(health?.score||0)+"/100.",
          updated_at:now,
          analyzed_at:now
        }).eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id);
      }catch(e){
        report.errors.push({agent:"customer_success",invite_id:invite.id,error:e instanceof Error?e.message:String(e)});
      }
    }

    for(const organizationId of learningOrgIds){
      try{
        const {data:last}=await db.from("commercial_learning_snapshots").select("created_at")
          .eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(1).maybeSingle();
        const ageHours=last?.created_at?(Date.now()-new Date(last.created_at).getTime())/3600000:999;
        if(ageHours<6)continue;
        const [{data:analytics,error:analyticsError},{data:capture,error:captureError},{data:saasFunnel,error:saasError}]=await Promise.all([
          db.rpc("compute_commercial_optimizer",{p_organization_id:organizationId,p_period_days:90}),
          db.rpc("compute_lead_capture_metrics",{p_organization_id:organizationId,p_period_days:90}),
          db.rpc("compute_saas_sales_funnel",{p_organization_id:organizationId,p_period_days:90})
        ]);
        if(analyticsError)throw analyticsError;
        if(captureError)throw captureError;
        if(saasError)throw saasError;
        const metrics={...(analytics||{}),capture:capture||{},saas_funnel:saasFunnel||{}};
        const {error:snapshotError}=await db.from("commercial_learning_snapshots").insert({
          organization_id:organizationId,
          period_days:90,
          metrics,
          sales_learning:metrics?.sales_learning||{},
          marketing_learning:metrics?.marketing_learning||{}
        });
        if(snapshotError)throw snapshotError;
        report.learning.snapshots_created++;
      }catch(e){
        report.errors.push({agent:"learning",organization_id:organizationId,error:e instanceof Error?e.message:String(e)});
      }
    }

    return J({ok:true,report});
  }catch(e){
    console.error("COMMERCIAL_AGENT_RUNNER",e);
    return J({error:"internal_error"},500);
  }
});
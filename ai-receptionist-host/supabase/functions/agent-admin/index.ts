import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json"
};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const text=(v:any,max:number)=>String(v??"").trim().slice(0,max);
const clamp=(v:any,min:number,max:number,fallback:number)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback};
const arr=(v:any,max=20,maxLen=120)=>Array.isArray(v)?v.map((x:any)=>text(x,maxLen)).filter(Boolean).slice(0,max):String(v??"").split(/[\n,]+/).map(x=>text(x,maxLen)).filter(Boolean).slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({error:"unauthorized"},401);
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY");
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url=Deno.env.get("SUPABASE_URL")!;
    if(!pub||!sec) return json({error:"server_configuration"},500);

    const uc=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const admin=createClient(url,sec,{auth:{persistSession:false}});
    const {data:{user},error:ue}=await uc.auth.getUser(auth.slice(7));
    if(ue||!user)return json({error:"unauthorized"},401);
    const {data:mem,error:me}=await uc.from("memberships").select("organization_id,role").eq("user_id",user.id).eq("active",true).single();
    if(me||!mem)return json({error:"forbidden"},403);

    const {data:org,error:orgError}=await admin.from("organizations")
      .select("plan,subscription_status,trial_ends_at,is_internal")
      .eq("id",mem.organization_id)
      .single();
    if(orgError||!org)return json({error:"organization_not_found"},404);
    const trialOk=org.is_internal===true||(org.plan==="trial"&&new Date(org.trial_ends_at).getTime()>Date.now());
    const paidOk=org.plan==="business"&&["active","trialing"].includes(String(org.subscription_status||""));
    if(!trialOk&&!paidOk)return json({error:"upgrade_required"},402);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"get");

    if(action==="get"){
      const [{data:sales},{data:marketing},{data:campaigns},{data:queueLeads},{data:opps},{data:salesTasks},{data:sequences},{data:sequenceSteps},{data:learningRows},{data:onboardingInvites}]=await Promise.all([
        admin.from("sales_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle(),
        admin.from("marketing_agent_configs").select("*").eq("organization_id",mem.organization_id).maybeSingle(),
        admin.from("marketing_campaigns").select("id,status,objective,audience,channel,hook,content,cta,rationale,source_signals,tracking_code,scheduled_for,published_at,external_url,created_at,updated_at")
          .eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(24),
        admin.from("leads").select("id,name,email,phone,status,score,summary,source,contact_consent_at,created_at,updated_at")
          .eq("organization_id",mem.organization_id).not("status","in","(won,lost)")
          .order("score",{ascending:false}).order("updated_at",{ascending:false}).limit(50),
        admin.from("sales_opportunities").select("lead_id,temperature,stage,confidence,next_action,reason,channel,can_contact,missing_info,analyzed_at")
          .eq("organization_id",mem.organization_id).limit(100),
        admin.from("tasks").select("id,lead_id,status,title").eq("organization_id",mem.organization_id).eq("status","open").ilike("title","Sales Agent:%").limit(100),
        admin.from("sales_sequences").select("id,lead_id,status,objective,current_step,created_at,updated_at")
          .eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(20),
        admin.from("sales_sequence_steps").select("id,sequence_id,lead_id,step_no,due_at,channel,message,status,requires_approval,workflow_action_id,created_at,updated_at")
          .eq("organization_id",mem.organization_id).order("step_no",{ascending:true}).limit(200),
        admin.from("commercial_learning_snapshots").select("metrics,created_at").eq("organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(1),
        admin.from("sales_onboarding_invites").select("id,token,lead_id,requested_plan,status,expires_at,claimed_organization_id,claimed_at,converted_at,created_at")
          .eq("sales_organization_id",mem.organization_id).order("created_at",{ascending:false}).limit(100)
      ]);
      const oppMap=new Map((opps||[]).map((x:any)=>[x.lead_id,x]));
      const onboardingMap=new Map();
      for(const invite of onboardingInvites||[])if(!onboardingMap.has(invite.lead_id))onboardingMap.set(invite.lead_id,invite);
      const salesQueue=(queueLeads||[]).map((lead:any)=>({
        ...lead,
        has_contact:Boolean(String(lead.email||"").trim()||String(lead.phone||"").trim()),
        opportunity:oppMap.get(lead.id)||null,
        onboarding:onboardingMap.get(lead.id)||null
      }));
      const leadMap=new Map((queueLeads||[]).map((x:any)=>[x.id,x]));
      const sequenceList=(sequences||[]).map((seq:any)=>({
        ...seq,
        lead:leadMap.get(seq.lead_id)||null,
        steps:(sequenceSteps||[]).filter((step:any)=>step.sequence_id===seq.id)
      }));
      const openLeads=queueLeads||[];
      const marketingRows=campaigns||[];
      const metrics={
        sales:{
          open:openLeads.length,
          warm:openLeads.filter((x:any)=>Number(x.score||0)>=60).length,
          hot:openLeads.filter((x:any)=>Number(x.score||0)>=80).length,
          actionable:openLeads.filter((x:any)=>Number(x.score||0)>=60&&Boolean(String(x.email||"").trim()||String(x.phone||"").trim())&&Boolean(x.contact_consent_at)).length,
          tasks:(salesTasks||[]).length,
          analyzed:(opps||[]).length,
          sequences:sequenceList.filter((x:any)=>["active","paused"].includes(x.status)).length,
          demo_requested:(opps||[]).filter((x:any)=>x.stage==="demo_requested").length,
          onboarding:(opps||[]).filter((x:any)=>x.stage==="onboarding").length,
          pilot_live:(opps||[]).filter((x:any)=>x.stage==="pilot_live").length,
          value_event:(opps||[]).filter((x:any)=>x.stage==="value_event").length,
          value_proven:(opps||[]).filter((x:any)=>x.stage==="value_proven").length,
          conversion_ready:(opps||[]).filter((x:any)=>x.stage==="conversion_ready").length,
          onboarding_pending:(onboardingInvites||[]).filter((x:any)=>x.status==="pending").length,
          converted:(onboardingInvites||[]).filter((x:any)=>x.status==="converted").length
        },
        marketing:{
          drafts:marketingRows.filter((x:any)=>x.status==="draft").length,
          approved:marketingRows.filter((x:any)=>x.status==="approved").length,
          archived:marketingRows.filter((x:any)=>x.status==="archived").length
        }
      };
      return json({
        sales:sales||{
          organization_id:mem.organization_id,name:"Sales Agent",active:false,min_score:60,preferred_channel:"auto",
          follow_up_due_hours:24,objective:"",offer:"",tone:"menselijk, professioneel en compact",
          brand_name:"",product_context:"",product_services:[],
          instructions:"",create_task_by_default:true,auto_triage:false,last_run_at:null
        },
        marketing:marketing||{
          organization_id:mem.organization_id,name:"Marketing Agent",active:false,target_audience:"",
          positioning:"",channels:["facebook","instagram"],content_pillars:[],cadence_per_week:3,
          tone:"menselijk, lokaal en betrouwbaar",call_to_action:"Neem contact op voor meer informatie",
          brand_name:"",product_context:"",product_services:[],landing_url:"",
          instructions:"",save_drafts:true,auto_drafts:false,last_run_at:null
        },
        campaigns:marketingRows,
        sales_queue:salesQueue,
        sequences:sequenceList,
        analytics:learningRows?.[0]?.metrics||null,
        analytics_updated_at:learningRows?.[0]?.created_at||null,
        metrics
      });
    }

    if(!["owner","admin"].includes(String(mem.role||""))) return json({error:"owner_or_admin_required"},403);

    if(action==="refresh_analytics"){
      const [{data:analytics,error:analyticsError},{data:capture,error:captureError},{data:saasFunnel,error:saasError}]=await Promise.all([
        admin.rpc("compute_commercial_optimizer",{p_organization_id:mem.organization_id,p_period_days:90}),
        admin.rpc("compute_lead_capture_metrics",{p_organization_id:mem.organization_id,p_period_days:90}),
        admin.rpc("compute_saas_sales_funnel",{p_organization_id:mem.organization_id,p_period_days:90})
      ]);
      if(analyticsError)throw analyticsError;
      if(captureError)throw captureError;
      if(saasError)throw saasError;
      const metrics={...(analytics||{}),capture:capture||{},saas_funnel:saasFunnel||{}};
      const {error:snapshotError}=await admin.from("commercial_learning_snapshots").insert({
        organization_id:mem.organization_id,period_days:90,metrics,
        sales_learning:metrics?.sales_learning||{},marketing_learning:metrics?.marketing_learning||{}
      });
      if(snapshotError)throw snapshotError;
      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"commercial_analytics.refreshed",
        entity_type:"organization",entity_id:mem.organization_id,payload:{period_days:90}
      });
      return json({ok:true,analytics:metrics,updated_at:new Date().toISOString()});
    }

    if(action==="save_sales"){
      const preferred=["auto","email","whatsapp","phone","crm"].includes(String(body.preferred_channel))?String(body.preferred_channel):"auto";
      const payload={
        organization_id:mem.organization_id,
        name:text(body.name,120)||"Sales Agent",
        active:body.active===true,
        min_score:clamp(body.min_score,0,100,60),
        preferred_channel:preferred,
        follow_up_due_hours:clamp(body.follow_up_due_hours,1,720,24),
        objective:text(body.objective,1200),
        offer:text(body.offer,1600),
        brand_name:text(body.brand_name,120),
        product_context:text(body.product_context,2400),
        product_services:arr(body.product_services,20,180),
        tone:text(body.tone,500)||"menselijk, professioneel en compact",
        instructions:text(body.instructions,4000),
        create_task_by_default:body.create_task_by_default!==false,
        auto_triage:body.auto_triage===true,
        updated_by:user.id,
        updated_at:new Date().toISOString()
      };
      const {error}=await admin.from("sales_agent_configs").upsert(payload,{onConflict:"organization_id"});
      if(error)throw error;
      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"sales_agent.config_saved",
        entity_type:"organization",entity_id:mem.organization_id,
        payload:{active:payload.active,min_score:payload.min_score,preferred_channel:payload.preferred_channel,auto_triage:payload.auto_triage,brand_name:payload.brand_name}
      });
      return json({ok:true,sales:payload});
    }

    if(action==="save_marketing"){
      const allowedChannels=["facebook","instagram","linkedin","email","website","google_business","tiktok"];
      const channels=arr(body.channels,8,40).filter((x:string)=>allowedChannels.includes(x));
      const payload={
        organization_id:mem.organization_id,
        name:text(body.name,120)||"Marketing Agent",
        active:body.active===true,
        target_audience:text(body.target_audience,1800),
        positioning:text(body.positioning,1800),
        brand_name:text(body.brand_name,120),
        product_context:text(body.product_context,2400),
        product_services:arr(body.product_services,20,180),
        landing_url:text(body.landing_url,1000),
        channels:channels.length?channels:["facebook","instagram"],
        content_pillars:arr(body.content_pillars,12,180),
        cadence_per_week:clamp(body.cadence_per_week,1,21,3),
        tone:text(body.tone,500)||"menselijk, lokaal en betrouwbaar",
        call_to_action:text(body.call_to_action,500)||"Neem contact op voor meer informatie",
        instructions:text(body.instructions,4000),
        save_drafts:body.save_drafts!==false,
        auto_drafts:body.auto_drafts===true,
        updated_by:user.id,
        updated_at:new Date().toISOString()
      };
      const {error}=await admin.from("marketing_agent_configs").upsert(payload,{onConflict:"organization_id"});
      if(error)throw error;
      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"marketing_agent.config_saved",
        entity_type:"organization",entity_id:mem.organization_id,
        payload:{active:payload.active,channels:payload.channels,cadence_per_week:payload.cadence_per_week,auto_drafts:payload.auto_drafts,brand_name:payload.brand_name}
      });
      return json({ok:true,marketing:payload});
    }

    if(action==="campaign_status"){
      const id=text(body.campaign_id,80);
      const status=["draft","approved","archived"].includes(String(body.status))?String(body.status):"";
      if(!id||!status)return json({error:"invalid_campaign_status"},400);
      const {data,error}=await admin.from("marketing_campaigns").update({status,updated_at:new Date().toISOString()})
        .eq("id",id).eq("organization_id",mem.organization_id).select("id,status").single();
      if(error)throw error;
      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"marketing_campaign.status_changed",
        entity_type:"marketing_campaign",entity_id:data.id,payload:{status}
      });
      return json({ok:true,...data});
    }

    if(action==="schedule_campaign"){
      const id=text(body.campaign_id,80);
      const raw=text(body.scheduled_for,80);
      const scheduled=new Date(raw);
      if(!id||!raw||Number.isNaN(scheduled.getTime()))return json({error:"invalid_schedule"},400);
      if(scheduled.getTime()<Date.now()-60000)return json({error:"schedule_must_be_future"},400);
      const {data:current}=await admin.from("marketing_campaigns").select("id,status").eq("id",id).eq("organization_id",mem.organization_id).single();
      if(!current)return json({error:"campaign_not_found"},404);
      if(current.status!=="approved")return json({error:"approve_campaign_first"},409);
      const {data,error}=await admin.from("marketing_campaigns").update({
        status:"scheduled",scheduled_for:scheduled.toISOString(),updated_at:new Date().toISOString()
      }).eq("id",id).eq("organization_id",mem.organization_id).select("id,status,scheduled_for").single();
      if(error)throw error;
      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"marketing_campaign.scheduled",
        entity_type:"marketing_campaign",entity_id:id,payload:{scheduled_for:data.scheduled_for}
      });
      return json({ok:true,...data});
    }

    if(action==="unschedule_campaign"){
      const id=text(body.campaign_id,80);
      if(!id)return json({error:"campaign_required"},400);
      const {data,error}=await admin.from("marketing_campaigns").update({
        status:"approved",scheduled_for:null,updated_at:new Date().toISOString()
      }).eq("id",id).eq("organization_id",mem.organization_id).eq("status","scheduled")
        .select("id,status,scheduled_for").single();
      if(error)throw error;
      return json({ok:true,...data});
    }

    if(action==="mark_campaign_published"){
      const id=text(body.campaign_id,80);
      const externalUrl=text(body.external_url,1000);
      if(!id)return json({error:"campaign_required"},400);
      if(externalUrl&&!/^https:\/\//i.test(externalUrl))return json({error:"invalid_external_url"},400);
      const {data,error}=await admin.from("marketing_campaigns").update({
        status:"published",published_at:new Date().toISOString(),external_url:externalUrl||null,updated_at:new Date().toISOString()
      }).eq("id",id).eq("organization_id",mem.organization_id).in("status",["approved","scheduled"])
        .select("id,status,published_at,external_url").single();
      if(error)throw error;
      await admin.from("audit_events").insert({
        organization_id:mem.organization_id,actor_user_id:user.id,event_type:"marketing_campaign.published_recorded",
        entity_type:"marketing_campaign",entity_id:id,payload:{external_url:data.external_url}
      });
      return json({ok:true,...data});
    }

    return json({error:"unknown_action"},400);
  }catch(e){
    console.error("AGENT_ADMIN",e);
    return json({error:"agent_admin_failed"},500);
  }
});
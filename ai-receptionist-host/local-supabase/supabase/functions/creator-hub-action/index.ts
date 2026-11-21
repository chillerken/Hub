import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};
const json = (data:any,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}
});
const clean=(v:any,max=1000)=>String(v??"").trim().slice(0,max);
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hexRe=/^#[0-9a-f]{6}$/i;

function lines(v:any,max=30){
  const arr=Array.isArray(v)?v:String(v??"").split(/\r?\n|,/g);
  return arr.map((x:any)=>clean(x,500)).filter(Boolean).slice(0,max);
}
function domains(v:any){
  const out:string[]=[];
  for(const raw of lines(v,20)){
    const host=raw.toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/^www\./,"");
    if(/^[a-z0-9.-]+$/.test(host)&&host.includes(".")&&!out.includes(host))out.push(host);
  }
  return out;
}
function safePayload(v:any){
  const raw=JSON.stringify(v??{});
  if(raw.length>250000) throw new Error("payload_too_large");
  return JSON.parse(raw);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method"},405);
  try{
    const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!jwt) return json({error:"Niet aangemeld"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});
    const {data:userData,error:userError}=await db.auth.getUser(jwt);
    const user=userData?.user;
    if(userError||!user) return json({error:"Sessie ongeldig"},401);
    const {data:admin}=await db.from("platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
    if(!admin) return json({error:"Geen platformbeheerrechten"},403);

    const body=await req.json().catch(()=>({}));
    const action=clean(body.action,80);

    if(action==="status") return json({ok:true,platform_admin:true,user_id:user.id});

    if(action==="client_dashboard"){
      const orgId=clean(body.organization_id,50);
      if(!uuidRe.test(orgId)) return json({error:"Ongeldige organisatie"},400);

      const [
        orgRes,profileRes,leadAgentRes,salesAgentRes,marketingAgentRes,leadsRes,appointmentsRes,workflowRes,
        integrationsRes,paymentsRes,assetsRes,tasksRes,handoffsRes,salesOppRes,campaignsRes
      ]=await Promise.all([
        db.from("organizations").select("id,name,status,plan,subscription_status,trial_ends_at,is_internal,stripe_customer_id,stripe_subscription_id,created_at,updated_at").eq("id",orgId).maybeSingle(),
        db.from("business_profiles").select("organization_id,business_name,receptionist_name,description,services,qualification_questions,widget_token,widget_enabled,widget_greeting,widget_accent,widget_allowed_domains,notification_email,automation_enabled,preferred_followup_channel,review_delay_hours,retention_delay_days,updated_at").eq("organization_id",orgId).maybeSingle(),
        db.from("lead_agent_configs").select("name,target_audience,offer,qualification_criteria,preferred_channel,min_score,follow_up_due_hours,active,updated_at").eq("organization_id",orgId).maybeSingle(),
        db.from("sales_agent_configs").select("name,active,min_score,preferred_channel,follow_up_due_hours,objective,offer,tone,instructions,create_task_by_default,updated_at").eq("organization_id",orgId).maybeSingle(),
        db.from("marketing_agent_configs").select("name,active,target_audience,positioning,channels,content_pillars,cadence_per_week,tone,call_to_action,instructions,save_drafts,updated_at").eq("organization_id",orgId).maybeSingle(),
        db.from("leads").select("id,name,email,phone,status,source,score,summary,created_at,updated_at,last_contact_at,contact_consent_at,marketing_consent_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
        db.from("appointments").select("id,lead_id,status,requested_text,start_at,end_at,timezone,provider,provider_booking_id,location,notes,created_at,updated_at,completed_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
        db.from("workflow_actions").select("id,lead_id,action_type,channel,status,priority,scheduled_at,attempts,max_attempts,provider,provider_reference,last_error,created_at,updated_at,completed_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(75),
        db.from("tenant_integrations").select("id,channel,provider,status,is_default,config,capabilities,last_verified_at,last_error,created_at,updated_at").eq("organization_id",orgId).order("channel",{ascending:true}),
        db.from("customer_payments").select("id,lead_id,appointment_id,status,amount_cents,currency,provider,provider_payment_id,payment_url,created_at,updated_at,paid_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
        db.from("creator_hub_assets").select("id,asset_type,title,status,payload,created_at,updated_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
        db.from("tasks").select("id,lead_id,title,status,priority,due_at,completed_at,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
        db.from("handoffs").select("id,lead_id,conversation_id,reason,status,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(30),
        db.from("sales_opportunities").select("lead_id,temperature,stage,confidence,next_action,reason,channel,can_contact,analyzed_at,updated_at").eq("organization_id",orgId).order("updated_at",{ascending:false}).limit(30),
        db.from("marketing_campaigns").select("id,status,objective,audience,channel,hook,content,cta,rationale,created_at,updated_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(20)
      ]);

      const failure=[orgRes,profileRes,leadAgentRes,salesAgentRes,marketingAgentRes,leadsRes,appointmentsRes,workflowRes,integrationsRes,paymentsRes,assetsRes,tasksRes,handoffsRes,salesOppRes,campaignsRes].find((x:any)=>x.error);
      if(failure?.error) throw failure.error;
      if(!orgRes.data) return json({error:"Klant niet gevonden"},404);

      const leads=leadsRes.data||[];
      const appointments=appointmentsRes.data||[];
      const workflows=workflowRes.data||[];
      const integrations=integrationsRes.data||[];
      const payments=paymentsRes.data||[];
      const tasks=tasksRes.data||[];
      const handoffs=handoffsRes.data||[];

      const moneyPaid=payments.filter((x:any)=>x.status==="paid").reduce((n:number,x:any)=>n+Number(x.amount_cents||0),0);
      const moneyPending=payments.filter((x:any)=>x.status==="pending").reduce((n:number,x:any)=>n+Number(x.amount_cents||0),0);

      return json({ok:true,client:{
        organization:orgRes.data,
        profile:profileRes.data||null,
        lead_agent:leadAgentRes.data||null,
        sales_agent:salesAgentRes.data||null,
        marketing_agent:marketingAgentRes.data||null,
        sales_opportunities:salesOppRes.data||[],
        marketing_campaigns:campaignsRes.data||[],
        leads,
        appointments,
        workflows,
        integrations,
        payments,
        assets:assetsRes.data||[],
        tasks,
        handoffs,
        metrics:{
          leads_total:leads.length,
          leads_qualified:leads.filter((x:any)=>["qualified","follow_up","handoff","won"].includes(x.status)).length,
          leads_won:leads.filter((x:any)=>x.status==="won").length,
          appointments_active:appointments.filter((x:any)=>["requested","proposed","confirmed"].includes(x.status)).length,
          appointments_completed:appointments.filter((x:any)=>x.status==="completed").length,
          workflows_pending:workflows.filter((x:any)=>["pending","processing"].includes(x.status)).length,
          workflows_problem:workflows.filter((x:any)=>["blocked","failed"].includes(x.status)).length,
          integrations_active:integrations.filter((x:any)=>x.status==="active").length,
          integrations_total:integrations.length,
          payments_paid_cents:moneyPaid,
          payments_pending_cents:moneyPending,
          open_tasks:tasks.filter((x:any)=>x.status==="open").length,
          open_handoffs:handoffs.filter((x:any)=>x.status==="open").length
        }
      }});
    }

    if(action==="set_business_agent"){
      const orgId=clean(body.organization_id,50);
      const agent=clean(body.agent,30);
      const active=body.active===true;
      if(!uuidRe.test(orgId)||!["sales","marketing"].includes(agent)) return json({error:"Ongeldige agent of organisatie"},400);
      const {data:org}=await db.from("organizations").select("id").eq("id",orgId).maybeSingle();
      if(!org) return json({error:"Klant niet gevonden"},404);

      if(agent==="sales"){
        const {data:existing}=await db.from("sales_agent_configs").select("organization_id").eq("organization_id",orgId).maybeSingle();
        if(existing){
          const {error}=await db.from("sales_agent_configs").update({
            active,updated_by:user.id,updated_at:new Date().toISOString()
          }).eq("organization_id",orgId);
          if(error)throw error;
        }else{
          const {error}=await db.from("sales_agent_configs").insert({
            organization_id:orgId,name:"Sales Agent",active,min_score:60,preferred_channel:"auto",
            follow_up_due_hours:24,objective:"Converteer warme leads naar een concrete volgende stap",
            offer:"",tone:"menselijk, professioneel en compact",instructions:"",
            create_task_by_default:true,updated_by:user.id
          });
          if(error)throw error;
        }
      }else{
        const {data:existing}=await db.from("marketing_agent_configs").select("organization_id").eq("organization_id",orgId).maybeSingle();
        if(existing){
          const {error}=await db.from("marketing_agent_configs").update({
            active,updated_by:user.id,updated_at:new Date().toISOString()
          }).eq("organization_id",orgId);
          if(error)throw error;
        }else{
          const {error}=await db.from("marketing_agent_configs").insert({
            organization_id:orgId,name:"Marketing Agent",active,target_audience:"",positioning:"",
            channels:["facebook","instagram"],content_pillars:[],cadence_per_week:3,
            tone:"menselijk, lokaal en betrouwbaar",call_to_action:"Neem contact op voor meer informatie",
            instructions:"",save_drafts:true,updated_by:user.id
          });
          if(error)throw error;
        }
      }
      await db.from("audit_events").insert({
        organization_id:orgId,actor_user_id:user.id,event_type:"creator_hub."+agent+"_agent_"+(active?"activated":"disabled"),
        entity_type:agent+"_agent_config",entity_id:orgId,payload:{active}
      });
      return json({ok:true,agent,active});
    }

    if(action==="lead_status_action"){
      const orgId=clean(body.organization_id,50);
      const leadId=clean(body.lead_id,50);
      const status=clean(body.status,30);
      if(!uuidRe.test(orgId)||!uuidRe.test(leadId))return json({error:"Ongeldige lead"},400);
      if(!["new","qualifying","qualified","follow_up","handoff","won","lost"].includes(status))return json({error:"Ongeldige leadstatus"},400);
      const {data:lead,error}=await db.from("leads").update({status,updated_at:new Date().toISOString()})
        .eq("id",leadId).eq("organization_id",orgId).select("id,status").maybeSingle();
      if(error||!lead)return json({error:"Lead niet gevonden"},404);
      await db.from("audit_events").insert({
        organization_id:orgId,actor_user_id:user.id,event_type:"creator_hub.lead_status_changed",
        entity_type:"lead",entity_id:leadId,payload:{status}
      });
      return json({ok:true,lead});
    }

    if(action==="retry_client_workflow"){
      const orgId=clean(body.organization_id,50);
      const workflowId=clean(body.workflow_action_id,50);
      if(!uuidRe.test(orgId)||!uuidRe.test(workflowId))return json({error:"Ongeldige workflowactie"},400);
      const {data:current,error}=await db.from("workflow_actions").select("*")
        .eq("id",workflowId).eq("organization_id",orgId).maybeSingle();
      if(error||!current)return json({error:"Workflowactie niet gevonden"},404);
      if(!["blocked","failed"].includes(current.status))return json({error:"Alleen geblokkeerde of mislukte acties kunnen opnieuw worden geprobeerd"},409);
      const unknown=String(current.last_error||"").toLowerCase().includes("delivery status is unknown")||String(current.last_error||"").toLowerCase().includes("delivery_unknown");
      if(unknown&&body.confirm_delivery_unknown!==true)return json({error:"Leveringsstatus is onbekend; opnieuw proberen kan een dubbel klantbericht veroorzaken.",code:"delivery_unknown_confirmation_required"},409);
      const {data:updated,error:ue}=await db.from("workflow_actions").update({
        status:"pending",attempts:0,scheduled_at:new Date().toISOString(),last_error:null,
        locked_at:null,locked_by:null,completed_at:null,updated_at:new Date().toISOString()
      }).eq("id",workflowId).eq("organization_id",orgId).select("id,status").single();
      if(ue)throw ue;
      await db.from("audit_events").insert({
        organization_id:orgId,actor_user_id:user.id,event_type:"creator_hub.workflow_retry",
        entity_type:"workflow_action",entity_id:workflowId,payload:{prior_status:current.status,delivery_unknown:unknown}
      });
      return json({ok:true,workflow_action:updated});
    }

    if(action==="client_appointment_action"){
      const orgId=clean(body.organization_id,50);
      const appointmentId=clean(body.appointment_id,50);
      const mode=clean(body.mode,30);
      if(!uuidRe.test(orgId)||!uuidRe.test(appointmentId)) return json({error:"Ongeldige afspraak"},400);
      if(!["schedule","confirm","cancel","complete"].includes(mode)) return json({error:"Ongeldige afspraakactie"},400);

      const {data:appt,error:ae}=await db.from("appointments").select("*")
        .eq("id",appointmentId).eq("organization_id",orgId).maybeSingle();
      if(ae||!appt) return json({error:"Afspraak niet gevonden"},404);

      let patch:any={updated_at:new Date().toISOString()};
      if(mode==="schedule"){
        const start=new Date(String(body.start_at||""));
        const end=new Date(String(body.end_at||""));
        if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start) return json({error:"Geldige start- en eindtijd zijn verplicht"},400);
        if(["completed","cancelled"].includes(appt.status)) return json({error:"Gesloten afspraak kan niet opnieuw worden gepland"},409);
        patch={...patch,start_at:start.toISOString(),end_at:end.toISOString(),timezone:clean(body.timezone,100)||"Europe/Brussels",location:clean(body.location,500)||appt.location||null,status:"proposed"};
      }else if(mode==="confirm"){
        if(!appt.start_at||!appt.end_at) return json({error:"Plan eerst een exacte start- en eindtijd"},409);
        if(["completed","cancelled"].includes(appt.status)) return json({error:"Gesloten afspraak kan niet worden bevestigd"},409);
        patch.status="confirmed";
      }else if(mode==="cancel"){
        if(appt.status==="completed") return json({error:"Afgeronde afspraak kan niet worden geannuleerd"},409);
        patch.status="cancelled";
      }else if(mode==="complete"){
        if(appt.status!=="confirmed") return json({error:"Alleen een bevestigde afspraak kan worden afgerond"},409);
        const {data:unpaid}=await db.from("customer_payments").select("id,status")
          .eq("organization_id",orgId).eq("appointment_id",appointmentId).neq("status","paid")
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(unpaid) return json({error:"Er staat nog een onbetaald betaalverzoek open.",code:"payment_required_before_completion"},409);
        patch.status="completed";patch.completed_at=new Date().toISOString();
      }

      const {data:updated,error:ue}=await db.from("appointments").update(patch)
        .eq("id",appointmentId).eq("organization_id",orgId).select("*").single();
      if(ue) throw ue;

      const audit=await db.from("audit_events").insert({
        organization_id:orgId,actor_user_id:user.id,event_type:"creator_hub.appointment_"+mode,
        entity_type:"appointment",entity_id:appointmentId,payload:{prior_status:appt.status,new_status:updated.status,start_at:updated.start_at,end_at:updated.end_at}
      });
      if(audit.error) console.error("client appointment audit",audit.error.message);
      return json({ok:true,appointment:updated});
    }

    if(action==="set_client_runtime"){
      const orgId=clean(body.organization_id,50);
      if(!uuidRe.test(orgId)) return json({error:"Ongeldige organisatie"},400);
      const {data:org}=await db.from("organizations").select("id,is_internal,status").eq("id",orgId).maybeSingle();
      if(!org) return json({error:"Klant niet gevonden"},404);

      const profilePatch:any={updated_at:new Date().toISOString()};
      if(typeof body.widget_enabled==="boolean") profilePatch.widget_enabled=body.widget_enabled;
      if(typeof body.automation_enabled==="boolean") profilePatch.automation_enabled=body.automation_enabled;
      if(Object.keys(profilePatch).length>1){
        const {error}=await db.from("business_profiles").update(profilePatch).eq("organization_id",orgId);
        if(error) throw error;
      }

      let nextStatus=org.status;
      if(body.organization_status){
        const requested=clean(body.organization_status,30);
        if(!["onboarding","active","suspended"].includes(requested)) return json({error:"Ongeldige klantstatus"},400);
        if(org.is_internal===true && requested==="suspended") return json({error:"Interne platformorganisatie kan hier niet worden geschorst."},409);
        const {error}=await db.from("organizations").update({status:requested,updated_at:new Date().toISOString()}).eq("id",orgId);
        if(error) throw error;
        nextStatus=requested;
      }

      const audit=await db.from("audit_events").insert({
        organization_id:orgId,actor_user_id:user.id,event_type:"creator_hub.client_runtime_updated",
        entity_type:"organization",entity_id:orgId,payload:{
          widget_enabled:typeof body.widget_enabled==="boolean"?body.widget_enabled:null,
          automation_enabled:typeof body.automation_enabled==="boolean"?body.automation_enabled:null,
          organization_status:body.organization_status||null
        }
      });
      if(audit.error) console.error("client runtime audit",audit.error.message);
      return json({ok:true,organization_status:nextStatus,...profilePatch});
    }

    if(action==="list_assets"){
      const {data,error}=await db.from("creator_hub_assets")
        .select("id,organization_id,asset_type,title,status,created_at,updated_at,payload")
        .eq("created_by",user.id)
        .order("created_at",{ascending:false})
        .limit(40);
      if(error) throw error;
      return json({ok:true,assets:data||[]});
    }

    if(action==="save_asset"){
      const type=clean(body.asset_type,40);
      if(!["website","quote","workflow","receptionist"].includes(type)) return json({error:"Ongeldig assettype"},400);
      const title=clean(body.title,160);
      if(!title) return json({error:"Titel is verplicht"},400);
      const orgId=clean(body.organization_id,50);
      if(orgId&&!uuidRe.test(orgId)) return json({error:"Ongeldige organisatie"},400);
      const payload=safePayload(body.payload);
      const status=["draft","ready","live","sent","archived"].includes(clean(body.status,20))?clean(body.status,20):"ready";
      const {data,error}=await db.from("creator_hub_assets").insert({
        created_by:user.id,
        organization_id:orgId||null,
        asset_type:type,
        title,
        status,
        payload
      }).select("id,asset_type,title,status,created_at").single();
      if(error) throw error;
      return json({ok:true,asset:data});
    }

    if(action==="save_workflow"){
      const name=clean(body.name,160);
      const orgId=clean(body.organization_id,50);
      const activateLifecycle=body.activate_lifecycle===true;
      if(!name) return json({error:"Workflownaam is verplicht"},400);
      if(orgId&&!uuidRe.test(orgId)) return json({error:"Ongeldige organisatie"},400);
      if(activateLifecycle&&!orgId) return json({error:"Kies een organisatie om de Reception AI-lifecycle te activeren."},400);
      const payload=safePayload(body.payload);

      if(orgId){
        const {data:profile}=await db.from("business_profiles").select("organization_id,automation_enabled").eq("organization_id",orgId).maybeSingle();
        if(!profile) return json({error:"Organisatieprofiel niet gevonden"},404);
        if(activateLifecycle){
          const {error:ue}=await db.from("business_profiles")
            .update({automation_enabled:true,updated_at:new Date().toISOString()})
            .eq("organization_id",orgId);
          if(ue) throw ue;
        }
      }

      const status=activateLifecycle?"active":"ready";
      const {data:asset,error}=await db.from("creator_hub_assets").insert({
        created_by:user.id,organization_id:orgId||null,asset_type:"workflow",
        title:name,status,payload:{...payload,execution_mode:activateLifecycle?"reception_ai_lifecycle":"blueprint"}
      }).select("id,asset_type,title,status,created_at").single();
      if(error) throw error;

      if(orgId){
        const aw=await db.from("audit_events").insert({
          organization_id:orgId,actor_user_id:user.id,
          event_type:activateLifecycle?"creator_hub.workflow_activated":"creator_hub.workflow_saved",
          entity_type:"creator_hub_asset",entity_id:asset.id,
          payload:{asset_id:asset.id,execution_mode:activateLifecycle?"reception_ai_lifecycle":"blueprint"}
        });
        if(aw.error) console.error("creator hub workflow audit",aw.error.message);
      }

      return json({ok:true,asset,lifecycle_active:activateLifecycle});
    }

    if(action==="publish_website"){
      const assetId=clean(body.asset_id,50);
      if(!uuidRe.test(assetId)) return json({error:"Ongeldige website"},400);
      const {data:asset,error}=await db.from("creator_hub_assets")
        .select("id,title,payload,public_token,status")
        .eq("id",assetId).eq("created_by",user.id).eq("asset_type","website").maybeSingle();
      if(error||!asset) return json({error:"Website niet gevonden"},404);
      const content=clean(asset.payload?.content,250000);
      if(!/^<!doctype html>|^<html[\\s>]/i.test(content)) return json({error:"Website bevat geen geldig HTML-document"},422);
      const {error:ue}=await db.from("creator_hub_assets")
        .update({status:"live",updated_at:new Date().toISOString()}).eq("id",asset.id);
      if(ue) throw ue;
      return json({
        ok:true,status:"live",
        public_url:url+"/functions/v1/public-creator-site?token="+asset.public_token
      });
    }

    if(action==="unpublish_website"){
      const assetId=clean(body.asset_id,50);
      if(!uuidRe.test(assetId)) return json({error:"Ongeldige website"},400);
      const {data:asset,error}=await db.from("creator_hub_assets")
        .select("id").eq("id",assetId).eq("created_by",user.id).eq("asset_type","website").maybeSingle();
      if(error||!asset) return json({error:"Website niet gevonden"},404);
      const {error:ue}=await db.from("creator_hub_assets")
        .update({status:"ready",updated_at:new Date().toISOString()}).eq("id",asset.id);
      if(ue) throw ue;
      return json({ok:true,status:"ready"});
    }

    if(action==="save_lead_agent"){
      const orgId=clean(body.organization_id,50);
      const name=clean(body.name,120)||"Lead Agent";
      const targetAudience=clean(body.target_audience,3000);
      const offer=clean(body.offer,5000);
      const criteria=clean(body.qualification_criteria,5000);
      const instructions=clean(body.instructions,12000);
      const rawChannel=clean(body.preferred_channel,40).toLowerCase();
      const channelMap:any={
        "e-mail":"email","email":"email","whatsapp":"whatsapp","linkedin":"linkedin",
        "telefoon + follow-up":"phone","telefoon":"phone","multichannel":"multichannel","auto":"auto"
      };
      const preferredChannel=channelMap[rawChannel]||"auto";
      const minScore=Math.max(0,Math.min(100,Number(body.min_score||60)));
      const dueHours=Math.max(1,Math.min(720,Number(body.follow_up_due_hours||24)));
      const active=body.active===true;
      if(!uuidRe.test(orgId)) return json({error:"Kies een geldige organisatie voor de Lead Agent."},400);

      const {data:org}=await db.from("organizations").select("id,name").eq("id",orgId).maybeSingle();
      if(!org) return json({error:"Organisatie niet gevonden"},404);

      const {error:ce}=await db.from("lead_agent_configs").upsert({
        organization_id:orgId,
        name,
        target_audience:targetAudience,
        offer,
        qualification_criteria:criteria,
        preferred_channel:preferredChannel,
        min_score:minScore,
        follow_up_due_hours:dueHours,
        instructions,
        active,
        updated_by:user.id,
        updated_at:new Date().toISOString()
      },{onConflict:"organization_id"});
      if(ce) throw ce;

      if(active){
        const supportedFollowup=["email","whatsapp"].includes(preferredChannel)?preferredChannel:"auto";
        const {error:pe}=await db.from("business_profiles").update({
          automation_enabled:true,
          preferred_followup_channel:supportedFollowup,
          updated_at:new Date().toISOString()
        }).eq("organization_id",orgId);
        if(pe) throw pe;
      }

      const payload=safePayload({
        name,target_audience:targetAudience,offer,qualification_criteria:criteria,
        preferred_channel:preferredChannel,min_score:minScore,follow_up_due_hours:dueHours,
        instructions,active
      });
      const {data:asset,error:ae}=await db.from("creator_hub_assets").insert({
        created_by:user.id,organization_id:orgId,asset_type:"lead_agent",
        title:name+" – "+(org.name||"Lead Agent"),status:active?"active":"ready",payload
      }).select("id,asset_type,title,status,created_at").single();
      if(ae) throw ae;

      const audit=await db.from("audit_events").insert({
        organization_id:orgId,actor_user_id:user.id,
        event_type:active?"creator_hub.lead_agent_activated":"creator_hub.lead_agent_saved",
        entity_type:"lead_agent_config",entity_id:orgId,
        payload:{asset_id:asset.id,min_score:minScore,follow_up_due_hours:dueHours,preferred_channel:preferredChannel}
      });
      if(audit.error) console.error("creator hub lead agent audit",audit.error.message);

      return json({ok:true,asset,active,organization_id:orgId,config:{
        name,preferred_channel:preferredChannel,min_score:minScore,follow_up_due_hours:dueHours
      }});
    }

    if(action==="create_receptionist"){
      const businessName=clean(body.business_name,120);
      const receptionistName=clean(body.receptionist_name,50)||"AI Assistent";
      const description=clean(body.description,4000);
      const customInstructions=clean(body.custom_instructions,12000);
      const greeting=clean(body.widget_greeting,180)||"Hallo! Waarmee kan ik helpen?";
      const accent=hexRe.test(clean(body.widget_accent,7))?clean(body.widget_accent,7):"#6d5dfc";
      const notificationEmail=clean(body.notification_email,250);
      if(!businessName) return json({error:"Bedrijfsnaam is verplicht"},400);
      if(notificationEmail&&!emailRe.test(notificationEmail)) return json({error:"Ongeldig notificatie-e-mailadres"},400);
      const serviceLines=lines(body.services,40);
      const questions=lines(body.qualification_questions,30);
      const allowed=domains(body.widget_allowed_domains);
      let orgId=clean(body.organization_id,50);
      let created=false;

      if(orgId){
        if(!uuidRe.test(orgId)) return json({error:"Ongeldige organisatie"},400);
        const {data:org}=await db.from("organizations").select("id").eq("id",orgId).maybeSingle();
        if(!org) return json({error:"Organisatie niet gevonden"},404);
      }else{
        const {data:org,error:oe}=await db.from("organizations").insert({
          name:businessName,status:"active",plan:"trial",subscription_status:"trialing",is_internal:false
        }).select("id").single();
        if(oe) throw oe;
        orgId=org.id; created=true;
      }

      const profile={
        organization_id:orgId,
        business_name:businessName,
        receptionist_name:receptionistName,
        description,
        custom_instructions:customInstructions,
        services:serviceLines,
        qualification_questions:questions,
        escalation_rules:{urgent:true,complaint:true,human_request:true},
        widget_greeting:greeting,
        widget_accent:accent,
        widget_allowed_domains:allowed,
        notification_email:notificationEmail||null,
        widget_enabled:true,
        automation_enabled:false,
        locale:"nl-BE",
        updated_at:new Date().toISOString()
      };
      const {data:existing}=await db.from("business_profiles").select("organization_id").eq("organization_id",orgId).maybeSingle();
      const write=existing
        ? await db.from("business_profiles").update(profile).eq("organization_id",orgId)
        : await db.from("business_profiles").insert(profile);
      if(write.error){
        if(created) await db.from("organizations").delete().eq("id",orgId);
        throw write.error;
      }
      await db.from("organizations").update({name:businessName,status:"active",updated_at:new Date().toISOString()}).eq("id",orgId);

      if(created){
        const integrations=[
          {organization_id:orgId,channel:"email",provider:"resend",status:"needs_setup",is_default:true,config:{},capabilities:["notify_owner","lead_follow_up","appointment_confirmation","payment_link_send","review_request","retention_follow_up"]},
          {organization_id:orgId,channel:"whatsapp",provider:"meta_whatsapp",status:"needs_setup",is_default:true,config:{},capabilities:["lead_follow_up","appointment_confirmation","payment_link_send","review_request","retention_follow_up"]},
          {organization_id:orgId,channel:"calendar",provider:"google_calendar",status:"needs_setup",is_default:true,config:{},capabilities:["calendar_request","calendar_cancel"]},
          {organization_id:orgId,channel:"payment",provider:"stripe",status:"needs_setup",is_default:true,config:{},capabilities:["payment_request","payment_received"]}
        ];
        const ir=await db.from("tenant_integrations").insert(integrations);
        if(ir.error) console.error("creator hub integration defaults",ir.error.message);
      }

      const {data:p,error:pe}=await db.from("business_profiles")
        .select("widget_token,business_name,receptionist_name,widget_enabled")
        .eq("organization_id",orgId).single();
      if(pe) throw pe;

      const assetPayload=safePayload({
        business_name:businessName,receptionist_name:receptionistName,description,
        custom_instructions:customInstructions,
        services:serviceLines,qualification_questions:questions,widget_greeting:greeting,
        widget_accent:accent,widget_allowed_domains:allowed,notification_email:notificationEmail||null,
        organization_created:created
      });
      const {data:asset,error:ae}=await db.from("creator_hub_assets").insert({
        created_by:user.id,organization_id:orgId,asset_type:"receptionist",
        title:businessName+" – AI Receptionist",status:"live",payload:assetPayload
      }).select("id").single();
      if(ae) throw ae;

      const auditWrite=await db.from("audit_events").insert({
        organization_id:orgId,actor_user_id:user.id,event_type:"creator_hub.receptionist_deployed",
        entity_type:"business_profile",entity_id:orgId,payload:{created,asset_id:asset.id}
      });
      if(auditWrite.error) console.error("creator hub audit",auditWrite.error.message);

      return json({
        ok:true,organization_id:orgId,created,asset_id:asset.id,
        widget_token:p.widget_token,
        widget_url:"https://reception-ai-rho.vercel.app/?widget="+p.widget_token
      });
    }

    if(action==="send_quote"){
      const assetId=clean(body.asset_id,50);
      const orgId=clean(body.organization_id,50);
      const to=clean(body.recipient_email,250);
      const subject=clean(body.subject,180)||"Offerte";
      if(!uuidRe.test(assetId)||!uuidRe.test(orgId)) return json({error:"Ongeldige offerte of organisatie"},400);
      if(!emailRe.test(to)) return json({error:"Ongeldig e-mailadres"},400);

      const {data:asset,error:assetErr}=await db.from("creator_hub_assets")
        .select("id,payload,title,status").eq("id",assetId).eq("created_by",user.id).eq("asset_type","quote").maybeSingle();
      if(assetErr||!asset) return json({error:"Offerte niet gevonden"},404);
      const quoteText=clean(asset.payload?.content||body.quote_text,50000);
      if(!quoteText) return json({error:"Offerte-inhoud ontbreekt"},400);

      const {data:integration}=await db.from("tenant_integrations")
        .select("id,provider,status,config").eq("organization_id",orgId).eq("channel","email").eq("is_default",true).maybeSingle();
      if(!integration||integration.status!=="active"||integration.provider!=="resend"){
        return json({error:"E-mailintegratie is niet actief voor deze organisatie.",code:"email_integration_required"},409);
      }
      const {data:secret,error:credErr}=await db.rpc("get_integration_credential",{
        p_integration_id:integration.id,p_organization_id:orgId
      });
      if(credErr||!secret) return json({error:"E-mailcredential ontbreekt.",code:"email_credential_required"},409);
      const cfg=integration.config||{};
      const fromEmail=clean(cfg.sender_email,250);
      const fromName=clean(cfg.sender_name,120);
      if(!emailRe.test(fromEmail)) return json({error:"Afzender-e-mail is niet geconfigureerd."},409);

      const resp=await fetch("https://api.resend.com/emails",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+secret,
          "Content-Type":"application/json",
          "Idempotency-Key":"creator-quote-"+asset.id
        },
        body:JSON.stringify({
          from:fromName?fromName+" <"+fromEmail+">":fromEmail,
          to:[to],
          subject,
          text:quoteText,
          reply_to:cfg.reply_to&&emailRe.test(cfg.reply_to)?cfg.reply_to:undefined,
          tags:[{name:"source",value:"creator_hub"},{name:"asset",value:String(asset.id).replace(/-/g,"")}]
        })
      });
      const rd=await resp.json().catch(()=>({}));
      if(!resp.ok) return json({error:clean(rd?.message||rd?.error||resp.statusText,1000)},resp.status>=500?502:400);

      const nextPayload={...asset.payload,recipient_email:to,email_subject:subject,sent_at:new Date().toISOString(),provider_id:rd?.id||null};
      await db.from("creator_hub_assets").update({status:"sent",payload:nextPayload,updated_at:new Date().toISOString()}).eq("id",asset.id);
      return json({ok:true,provider_id:rd?.id||null});
    }

    return json({error:"Onbekende actie"},400);
  }catch(e){
    console.error("CREATOR_HUB_ACTION",e);
    const msg=String((e as any)?.message||e||"");
    if(msg==="payload_too_large") return json({error:"Asset is te groot."},413);
    return json({error:"Creator Hub kon de aanvraag niet verwerken."},500);
  }
});
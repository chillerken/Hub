import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json"
};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);

const LOST:Record<string,string>={
  price_budget:"Prijs / budget",
  no_response:"Geen reactie / niet bereikbaar",
  timing:"Timing / later",
  competitor:"Concurrent gekozen",
  no_fit:"Geen goede match",
  availability:"Beschikbaarheid / planning",
  not_interested:"Geen interesse meer",
  invalid_duplicate:"Ongeldige / dubbele lead",
  other:"Andere reden"
};

async function refreshLearning(db:any,organizationId:string){
  const [{data:analytics,error:aErr},{data:capture,error:cErr}]=await Promise.all([
    db.rpc("compute_commercial_optimizer",{p_organization_id:organizationId,p_period_days:90}),
    db.rpc("compute_lead_capture_metrics",{p_organization_id:organizationId,p_period_days:90})
  ]);
  if(aErr)throw aErr;
  if(cErr)throw cErr;
  const metrics={...(analytics||{}),capture:capture||{}};
  const {error}=await db.from("commercial_learning_snapshots").insert({
    organization_id:organizationId,
    period_days:90,
    metrics,
    sales_learning:metrics?.sales_learning||{},
    marketing_learning:metrics?.marketing_learning||{}
  });
  if(error)throw error;
  return metrics;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return J({error:"unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY");
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!pub||!sec)return J({error:"server_configuration"},500);

    const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const admin=createClient(url,sec,{auth:{persistSession:false}});
    const {data:{user},error:userErr}=await userDb.auth.getUser(auth.slice(7));
    if(userErr||!user)return J({error:"unauthorized"},401);

    const {data:membership,error:memErr}=await userDb.from("memberships")
      .select("organization_id,role")
      .eq("user_id",user.id).eq("active",true).single();
    if(memErr||!membership)return J({error:"forbidden"},403);

    const body=await req.json().catch(()=>({}));
    const leadId=clean(body.lead_id,80);
    const status=String(body.status||"");
    const notes=clean(body.notes,1000);
    if(!leadId||!["won","lost"].includes(status))return J({error:"invalid_outcome"},400);

    const {data:lead}=await admin.from("leads")
      .select("id,status,name,outcome_reason,outcome_notes,lost_reason_code")
      .eq("id",leadId).eq("organization_id",membership.organization_id).single();
    if(!lead)return J({error:"lead_not_found"},404);

    let update:any={status,updated_at:new Date().toISOString(),outcome_notes:notes||null};
    let reasonCode:string|null=null;
    let reasonLabel="";

    if(status==="lost"){
      reasonCode=String(body.reason_code||"");
      if(!LOST[reasonCode])return J({error:"invalid_lost_reason"},400);
      reasonLabel=LOST[reasonCode];
      update.lost_reason_code=reasonCode;
      update.outcome_reason=reasonLabel;
    }else{
      reasonLabel=clean(body.reason,160)||"Gewonnen";
      update.lost_reason_code=null;
      update.outcome_reason=reasonLabel;
    }

    const {data:updated,error:updateErr}=await admin.from("leads")
      .update(update)
      .eq("id",leadId).eq("organization_id",membership.organization_id)
      .select("id,status,outcome_reason,outcome_notes,lost_reason_code,won_at,lost_at").single();
    if(updateErr)throw updateErr;

    await admin.from("audit_events").insert({
      organization_id:membership.organization_id,
      actor_user_id:user.id,
      event_type:status==="lost"?"lead.loss_reason_recorded":"lead.won_reason_recorded",
      entity_type:"lead",
      entity_id:leadId,
      payload:{
        prior_status:lead.status,
        status,
        reason_code:reasonCode,
        reason:reasonLabel,
        has_notes:Boolean(notes)
      }
    });

    let analytics:any=null;
    try{analytics=await refreshLearning(admin,membership.organization_id)}
    catch(e){console.error("OUTCOME_ANALYTICS_REFRESH",e instanceof Error?e.message:String(e))}

    return J({ok:true,lead:updated,analytics_refreshed:Boolean(analytics),analytics});
  }catch(e){
    console.error("LEAD_OUTCOME_ACTION",e);
    return J({error:"internal_error"},500);
  }
});
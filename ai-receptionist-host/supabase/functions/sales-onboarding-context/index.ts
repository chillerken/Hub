import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store, max-age=0",
  "Referrer-Policy":"no-referrer"
};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const b=await req.json().catch(()=>({}));
    const token=clean(b.token,80);
    if(!/^[0-9a-f-]{36}$/i.test(token))return J({error:"invalid_onboarding_link"},400);

    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});
    const {data:invite,error}=await db.from("sales_onboarding_invites")
      .select("id,requested_plan,status,expires_at,claimed_organization_id,lead_id,sales_organization_id")
      .eq("token",token).maybeSingle();
    if(error)throw error;
    if(!invite)return J({error:"onboarding_link_not_found"},404);

    const expired=new Date(invite.expires_at).getTime()<=Date.now();
    if(expired&&invite.status==="pending"){
      await db.from("sales_onboarding_invites").update({status:"expired",updated_at:new Date().toISOString()}).eq("id",invite.id);
    }
    if(expired)return J({error:"onboarding_link_expired"},410);
    if(["cancelled","converted"].includes(String(invite.status||"")))return J({error:"onboarding_link_closed",status:invite.status},409);

    const {data:lead}=await db.from("leads")
      .select("qualification")
      .eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id).single();
    if(!lead)return J({error:"onboarding_lead_not_found"},404);

    return J({
      ok:true,
      status:invite.status,
      requested_plan:invite.requested_plan,
      expires_at:invite.expires_at,
      claimed:Boolean(invite.claimed_organization_id),
      prospect:{
        company:String(lead.qualification?.company||"")
      }
    });
  }catch(e){
    console.error("SALES_ONBOARDING_CONTEXT",e);
    return J({error:"onboarding_context_failed"},500);
  }
});
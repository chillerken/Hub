import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const out=(body:any,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json"}
});
const clean=(v:any,max=1000)=>String(v??"").trim().slice(0,max);
const isEmail=(v:any)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||""));

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return out({error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return out({error:"Unauthorized"},401);
    const token=auth.slice(7);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userDb=createClient(url,anon,{
      auth:{persistSession:false},
      global:{headers:{Authorization:auth}}
    });
    const serviceDb=createClient(url,service,{auth:{persistSession:false}});

    const {data:userRes,error:userErr}=await userDb.auth.getUser(token);
    const user=userRes?.user;
    if(userErr||!user) return out({error:"Unauthorized"},401);

    const {data:membership,error:memErr}=await userDb.from("memberships")
      .select("organization_id,role,active")
      .eq("user_id",user.id).eq("active",true).single();
    if(memErr||!membership) return out({error:"Organization membership not found"},403);
    if(!["owner","admin"].includes(membership.role)) return out({error:"Owner or admin role required"},403);

    const body=await req.json();
    const action=clean(body.action,40);
    const integrationId=clean(body.integration_id,80);
    if(!integrationId) return out({error:"integration_id required"},400);

    const {data:integration,error:intErr}=await userDb.from("tenant_integrations")
      .select("*")
      .eq("id",integrationId)
      .eq("organization_id",membership.organization_id)
      .single();
    if(intErr||!integration) return out({error:"Integration not found"},404);

    if(action==="disconnect"){
      const {error:removeErr}=await serviceDb.rpc("remove_integration_credential",{
        p_integration_id:integration.id,
        p_organization_id:membership.organization_id
      });
      if(removeErr) throw removeErr;
      const {data:updated,error:updErr}=await serviceDb.from("tenant_integrations")
        .update({status:"disabled",last_error:null,last_verified_at:null})
        .eq("id",integration.id).eq("organization_id",membership.organization_id)
        .select("id,channel,provider,status,config,last_verified_at,last_error")
        .single();
      if(updErr) throw updErr;
      return out({ok:true,integration:updated});
    }

    if(action!=="configure") return out({error:"Unknown action"},400);

    const config=(body.config&&typeof body.config==="object"&&!Array.isArray(body.config))?body.config:{};
    const secret=clean(body.secret,12000);
    const activate=body.activate===true;

    const nextConfig={...integration.config,...config};
    delete (nextConfig as any).secret;
    delete (nextConfig as any).api_key;
    delete (nextConfig as any).access_token;

    if(integration.provider==="resend"){
      if(integration.channel!=="email") return out({error:"Resend is only valid for email"},400);
      if(!isEmail(nextConfig.sender_email)) return out({error:"A valid sender_email is required"},400);
      if(activate && !secret){
        const {data:existing}=await serviceDb.rpc("get_integration_credential",{
          p_integration_id:integration.id,p_organization_id:membership.organization_id
        });
        if(!existing) return out({error:"Resend API key required before activation"},400);
      }
    } else if(integration.provider==="meta_whatsapp"){
      if(integration.channel!=="whatsapp") return out({error:"Meta WhatsApp is only valid for WhatsApp"},400);
      if(!clean(nextConfig.phone_number_id,100)) return out({error:"phone_number_id is required"},400);
      if(!/^v\d+\.\d+$/.test(clean(nextConfig.api_version,20))) return out({error:"api_version must look like v23.0"},400);
      if(activate && !secret){
        const {data:existing}=await serviceDb.rpc("get_integration_credential",{
          p_integration_id:integration.id,p_organization_id:membership.organization_id
        });
        if(!existing) return out({error:"WhatsApp access token required before activation"},400);
      }
    } else if(integration.provider==="webhook"){
      if(!/^https:\/\//i.test(clean(nextConfig.endpoint,1000))) return out({error:"HTTPS webhook endpoint required"},400);
    } else if(activate && ["google_calendar","stripe"].includes(integration.provider)){
      return out({error:`${integration.provider} runtime adapter is not enabled yet`},409);
    }

    if(secret){
      const {error:secretErr}=await serviceDb.rpc("set_integration_credential",{
        p_integration_id:integration.id,
        p_organization_id:membership.organization_id,
        p_secret:secret
      });
      if(secretErr) throw secretErr;
    }

    let verifiedAt:any=null;
    let lastError:any=null;

    if(activate && integration.provider==="meta_whatsapp"){
      const {data:tokenValue}=await serviceDb.rpc("get_integration_credential",{
        p_integration_id:integration.id,p_organization_id:membership.organization_id
      });
      try{
        const vr=await fetch(`https://graph.facebook.com/${nextConfig.api_version}/${nextConfig.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,{
          headers:{Authorization:`Bearer ${tokenValue}`}
        });
        const vj=await vr.json().catch(()=>({}));
        if(!vr.ok){
          return out({error:"WhatsApp credential verification failed",detail:clean(vj?.error?.message||vr.statusText,800)},400);
        }
        verifiedAt=new Date().toISOString();
        nextConfig.display_phone_number=vj.display_phone_number||nextConfig.display_phone_number||null;
        nextConfig.verified_name=vj.verified_name||nextConfig.verified_name||null;
        nextConfig.quality_rating=vj.quality_rating||nextConfig.quality_rating||null;
      }catch(e){
        lastError=clean(e instanceof Error?e.message:e,800);
        return out({error:"WhatsApp verification failed",detail:lastError},400);
      }
    }

    const status=activate?"active":integration.status==="active"?"active":"needs_setup";
    const patch:any={config:nextConfig,status,last_error:lastError,updated_at:new Date().toISOString()};
    if(verifiedAt) patch.last_verified_at=verifiedAt;

    const {data:updated,error:updErr}=await serviceDb.from("tenant_integrations")
      .update(patch)
      .eq("id",integration.id)
      .eq("organization_id",membership.organization_id)
      .select("id,channel,provider,status,config,capabilities,last_verified_at,last_error")
      .single();
    if(updErr) throw updErr;

    return out({ok:true,integration:updated});
  }catch(e){
    console.error(e);
    return out({error:"Integration update failed",detail:clean(e instanceof Error?e.message:e,1000)},500);
  }
});
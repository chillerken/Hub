import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const clean=(v:any,max=2000)=>String(v??"").trim().slice(0,max);

async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

const safeRedirect=(base:string,params:Record<string,string>)=>{
  let u:URL;
  try{u=new URL(base);}catch{u=new URL("https://reception-ai-luxwash.onrender.com/?view=integrations");}
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
  return u.toString();
};

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET") return new Response("Method not allowed",{status:405});

  const url=Deno.env.get("SUPABASE_URL")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,service,{auth:{persistSession:false}});
  const incoming=new URL(req.url);
  const state=clean(incoming.searchParams.get("state"),300);
  const code=clean(incoming.searchParams.get("code"),5000);
  const oauthError=clean(incoming.searchParams.get("error"),300);

  let fallback="https://reception-ai-luxwash.onrender.com/?view=integrations";
  try{
    const {data:appUrl}=await db.rpc("get_platform_secret",{p_name:"reception_ai_app_url"});
    if(appUrl) fallback=String(appUrl)+"/?view=integrations";
  }catch{}

  if(!state) return Response.redirect(safeRedirect(fallback,{calendar:"error",reason:"state_missing"}),302);

  const stateHash=await sha256(state);
  const {data:states,error:stateErr}=await db.rpc("consume_oauth_state",{p_state_hash:stateHash});
  const st=Array.isArray(states)?states[0]:states;
  if(stateErr||!st) return Response.redirect(safeRedirect(fallback,{calendar:"error",reason:"state_invalid"}),302);

  const redirectAfter=clean(st.redirect_after,1000)||fallback;
  if(oauthError) return Response.redirect(safeRedirect(redirectAfter,{calendar:"error",reason:oauthError}),302);
  if(!code) return Response.redirect(safeRedirect(redirectAfter,{calendar:"error",reason:"code_missing"}),302);

  try{
    const [{data:clientId},{data:clientSecret}]=await Promise.all([
      db.rpc("get_platform_secret",{p_name:"reception_ai_google_client_id"}),
      db.rpc("get_platform_secret",{p_name:"reception_ai_google_client_secret"})
    ]);
    if(!clientId||!clientSecret) {
      return Response.redirect(safeRedirect(redirectAfter,{calendar:"error",reason:"platform_oauth_not_configured"}),302);
    }

    const redirectUri=url+"/functions/v1/google-calendar-oauth-callback";
    const form=new URLSearchParams({
      client_id:String(clientId),
      client_secret:String(clientSecret),
      code,
      grant_type:"authorization_code",
      redirect_uri:redirectUri
    });
    const tokenResp=await fetch("https://oauth2.googleapis.com/token",{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:form
    });
    const tokenBody=await tokenResp.json().catch(()=>({}));
    if(!tokenResp.ok) {
      console.error("google token exchange",tokenBody);
      return Response.redirect(safeRedirect(redirectAfter,{calendar:"error",reason:"token_exchange_failed"}),302);
    }

    const granted=String(tokenBody.scope||"");
    if(!granted.split(/\s+/).includes("https://www.googleapis.com/auth/calendar.events")) {
      return Response.redirect(safeRedirect(redirectAfter,{calendar:"error",reason:"calendar_scope_not_granted"}),302);
    }

    const {data:existingRaw}=await db.rpc("get_integration_credential",{
      p_integration_id:st.integration_id,
      p_organization_id:st.organization_id
    });
    let existing:any={};
    if(existingRaw){try{existing=JSON.parse(existingRaw)}catch{}}
    const refreshToken=clean(tokenBody.refresh_token||existing.refresh_token,6000);
    if(!refreshToken) {
      return Response.redirect(safeRedirect(redirectAfter,{calendar:"error",reason:"refresh_token_missing"}),302);
    }

    const credential=JSON.stringify({
      refresh_token:refreshToken,
      access_token:clean(tokenBody.access_token,6000),
      expires_at:Date.now()+Math.max(0,Number(tokenBody.expires_in||3600)-60)*1000,
      token_type:clean(tokenBody.token_type||"Bearer",100),
      scope:granted
    });
    const {error:credErr}=await db.rpc("set_integration_credential",{
      p_integration_id:st.integration_id,
      p_organization_id:st.organization_id,
      p_secret:credential
    });
    if(credErr) throw credErr;

    const {error:updateErr}=await db.from("tenant_integrations")
      .update({
        status:"active",
        config:{
          calendar_id:"primary",
          scope:"https://www.googleapis.com/auth/calendar.events",
          oauth_connected:true
        },
        last_verified_at:new Date().toISOString(),
        last_error:null,
        updated_at:new Date().toISOString()
      })
      .eq("id",st.integration_id)
      .eq("organization_id",st.organization_id);
    if(updateErr) throw updateErr;

    await db.from("audit_events").insert({
      organization_id:st.organization_id,
      actor_user_id:st.user_id,
      event_type:"integration.google_calendar_connected",
      entity_type:"tenant_integration",
      entity_id:st.integration_id,
      payload:{scope:"https://www.googleapis.com/auth/calendar.events",calendar_id:"primary"}
    });

    return Response.redirect(safeRedirect(redirectAfter,{calendar:"connected"}),302);
  }catch(e){
    console.error(e);
    return Response.redirect(safeRedirect(redirectAfter,{calendar:"error",reason:"callback_failed"}),302);
  }
});
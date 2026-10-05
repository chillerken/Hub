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
      let disconnectWarning:any=null;
      if(integration.provider==="stripe" && integration.config?.webhook_managed && integration.config?.webhook_endpoint_id){
        try{
          const {data:rawStripe}=await serviceDb.rpc("get_integration_credential",{
            p_integration_id:integration.id,p_organization_id:membership.organization_id
          });
          let stripeKey="";
          try{stripeKey=clean(JSON.parse(rawStripe||"{}")?.secret_key,2000)}catch{}
          if(stripeKey){
            const form=new URLSearchParams({disabled:"true"});
            const wr=await fetch(`https://api.stripe.com/v1/webhook_endpoints/${encodeURIComponent(integration.config.webhook_endpoint_id)}`,{
              method:"POST",
              headers:{Authorization:`Bearer ${stripeKey}`,"Content-Type":"application/x-www-form-urlencoded"},
              body:form
            });
            if(!wr.ok){
              const wj=await wr.json().catch(()=>({}));
              disconnectWarning="Stripe webhook could not be disabled automatically: "+clean(wj?.error?.message||wr.statusText,500);
            }
          }
        }catch(e){
          disconnectWarning="Stripe webhook disable check failed";
        }
      }

      const {error:removeErr}=await serviceDb.rpc("remove_integration_credential",{
        p_integration_id:integration.id,
        p_organization_id:membership.organization_id
      });
      if(removeErr) throw removeErr;
      const {data:updated,error:updErr}=await serviceDb.from("tenant_integrations")
        .update({status:"disabled",last_error:disconnectWarning,last_verified_at:null})
        .eq("id",integration.id).eq("organization_id",membership.organization_id)
        .select("id,channel,provider,status,config,last_verified_at,last_error")
        .single();
      if(updErr) throw updErr;
      await serviceDb.from("audit_events").insert({
        organization_id:membership.organization_id,
        actor_user_id:user.id,
        event_type:"integration.disconnected",
        entity_type:"tenant_integration",
        entity_id:integration.id,
        payload:{channel:integration.channel,provider:integration.provider,warning:disconnectWarning}
      });
      return out({ok:true,integration:updated,warning:disconnectWarning});
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
    } else if(integration.provider==="stripe"){
      if(integration.channel!=="payment") return out({error:"Stripe is only valid for payment"},400);
      if(!/^https:\/\//i.test(clean(nextConfig.success_url,1000))||!/^https:\/\//i.test(clean(nextConfig.cancel_url,1000))) return out({error:"HTTPS success_url and cancel_url are required"},400);
    } else if(integration.provider==="webhook"){
      if(!/^https:\/\//i.test(clean(nextConfig.endpoint,1000))) return out({error:"HTTPS webhook endpoint required"},400);
    } else if(activate && integration.provider==="google_calendar"){
      return out({error:"google_calendar runtime adapter is not enabled yet"},409);
    }

    let credentialToStore=secret;
    let stripeCredential:any=null;
    if(integration.provider==="stripe"){
      let existing:any={};
      const {data:existingRaw}=await serviceDb.rpc("get_integration_credential",{
        p_integration_id:integration.id,p_organization_id:membership.organization_id
      });
      if(existingRaw){try{existing=JSON.parse(existingRaw)}catch{}}
      const webhookSecret=clean(body.webhook_secret,2000)||clean(existing?.webhook_secret,2000);
      const secretKey=secret||clean(existing?.secret_key,2000);
      if(activate && (!secretKey || (!secretKey.startsWith("sk_")&&!secretKey.startsWith("rk_")))) return out({error:"Stripe secret/restricted key required before activation"},400);
      if(body.webhook_secret && !webhookSecret.startsWith("whsec_")) return out({error:"Stripe webhook signing secret must start with whsec_"},400);
      stripeCredential={...existing,secret_key:secretKey,webhook_secret:webhookSecret};
      credentialToStore=(secret||body.webhook_secret)?JSON.stringify(stripeCredential):"";
    }

    if(credentialToStore){
      const {error:secretErr}=await serviceDb.rpc("set_integration_credential",{
        p_integration_id:integration.id,
        p_organization_id:membership.organization_id,
        p_secret:credentialToStore
      });
      if(secretErr) throw secretErr;
    }

    let verifiedAt:any=null;
    let lastError:any=null;

    if(activate && integration.provider==="resend"){
      const {data:resendKey}=await serviceDb.rpc("get_integration_credential",{
        p_integration_id:integration.id,p_organization_id:membership.organization_id
      });
      const {data:profile}=await serviceDb.from("business_profiles")
        .select("business_name,notification_email")
        .eq("organization_id",membership.organization_id)
        .single();
      const target=clean(profile?.notification_email,250);
      if(!isEmail(target)) return out({error:"A valid notification email is required before activating Resend"},400);

      try{
        const rr=await fetch("https://api.resend.com/emails",{
          method:"POST",
          headers:{
            Authorization:`Bearer ${resendKey}`,
            "Content-Type":"application/json",
            "Idempotency-Key":`integration-${integration.id}-verify-${Date.now()}`
          },
          body:JSON.stringify({
            from:`${clean(nextConfig.sender_name||profile?.business_name||"mijn.ai Business",120)} <${clean(nextConfig.sender_email,250)}>`,
            to:[target],
            subject:"mijn.ai Business – e-mailkoppeling getest",
            text:"Deze test bevestigt dat de e-mailintegratie correct kan verzenden. Er is geen klantbericht verstuurd."
          })
        });
        const rj=await rr.json().catch(()=>({}));
        if(!rr.ok){
          return out({error:"Resend sending verification failed",detail:clean(rj?.message||rj?.error||rr.statusText,800)},400);
        }
        verifiedAt=new Date().toISOString();
        nextConfig.resend_test_email_id=rj?.id||null;
        nextConfig.verified_sender=nextConfig.sender_email;
      }catch(e){
        lastError=clean(e instanceof Error?e.message:e,800);
        return out({error:"Resend verification failed",detail:lastError},400);
      }
    }

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

    if(activate && integration.provider==="stripe"){
      const {data:rawStripe}=await serviceDb.rpc("get_integration_credential",{
        p_integration_id:integration.id,p_organization_id:membership.organization_id
      });
      let stored:any={};
      try{stored=JSON.parse(rawStripe||"{}")}catch{}
      const stripeKey=clean(stored?.secret_key,2000);
      try{
        const vr=await fetch("https://api.stripe.com/v1/account",{headers:{Authorization:`Bearer ${stripeKey}`}});
        const vj=await vr.json().catch(()=>({}));
        if(!vr.ok) return out({error:"Stripe credential verification failed",detail:clean(vj?.error?.message||vr.statusText,800)},400);

        const webhookUrl=`https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/customer-payment-webhook?integration_id=${encodeURIComponent(integration.id)}`;
        let webhookSecret=clean(stored?.webhook_secret,2000);
        let webhookEndpointId=clean(nextConfig.webhook_endpoint_id||stored?.webhook_endpoint_id,500);

        if(webhookSecret && webhookEndpointId && nextConfig.webhook_managed===true){
          const form=new URLSearchParams();
          form.append("url",webhookUrl);
          form.append("enabled_events[]","checkout.session.completed");
          form.append("enabled_events[]","checkout.session.async_payment_succeeded");
          form.append("enabled_events[]","checkout.session.async_payment_failed");
          form.append("enabled_events[]","checkout.session.expired");
          const wr=await fetch(`https://api.stripe.com/v1/webhook_endpoints/${encodeURIComponent(webhookEndpointId)}`,{
            method:"POST",
            headers:{Authorization:`Bearer ${stripeKey}`,"Content-Type":"application/x-www-form-urlencoded"},
            body:form
          });
          const wj=await wr.json().catch(()=>({}));
          if(!wr.ok){
            return out({
              error:"Stripe webhook exists but could not be migrated to the tenant-specific endpoint",
              detail:clean(wj?.error?.message||wr.statusText,800),
              code:"stripe_webhook_migration_failed",
              webhook_url:webhookUrl
            },400);
          }
        }

        if(!webhookSecret){
          const form=new URLSearchParams();
          form.append("url",webhookUrl);
          form.append("enabled_events[]","checkout.session.completed");
          form.append("enabled_events[]","checkout.session.async_payment_succeeded");
          form.append("enabled_events[]","checkout.session.async_payment_failed");
          form.append("enabled_events[]","checkout.session.expired");
          form.append("description","mijn.ai Business customer payment verification");
          form.append("metadata[organization_id]",String(membership.organization_id));

          const wr=await fetch("https://api.stripe.com/v1/webhook_endpoints",{
            method:"POST",
            headers:{Authorization:`Bearer ${stripeKey}`,"Content-Type":"application/x-www-form-urlencoded"},
            body:form
          });
          const wj=await wr.json().catch(()=>({}));
          if(!wr.ok){
            return out({
              error:"Stripe account verified, but webhook provisioning failed",
              detail:clean(wj?.error?.message||wr.statusText,800),
              code:"stripe_webhook_manual_setup_required",
              webhook_url:webhookUrl
            },400);
          }
          webhookSecret=clean(wj?.secret,2000);
          webhookEndpointId=clean(wj?.id,500);
          if(!webhookSecret.startsWith("whsec_")||!webhookEndpointId){
            return out({error:"Stripe webhook was created without a usable signing secret"},500);
          }

          stored={...stored,secret_key:stripeKey,webhook_secret:webhookSecret,webhook_endpoint_id:webhookEndpointId};
          const {error:storeWebhookErr}=await serviceDb.rpc("set_integration_credential",{
            p_integration_id:integration.id,
            p_organization_id:membership.organization_id,
            p_secret:JSON.stringify(stored)
          });
          if(storeWebhookErr) throw storeWebhookErr;
          nextConfig.webhook_managed=true;
        }else{
          nextConfig.webhook_managed=nextConfig.webhook_managed??false;
        }

        nextConfig.webhook_endpoint_id=webhookEndpointId||null;
        nextConfig.webhook_endpoint_url=webhookUrl;
        nextConfig.stripe_account_id=vj?.id||nextConfig.stripe_account_id||null;
        nextConfig.stripe_country=vj?.country||nextConfig.stripe_country||null;
        nextConfig.stripe_mode=stripeKey.startsWith("sk_live_")||stripeKey.startsWith("rk_live_")
          ?"live"
          :stripeKey.startsWith("sk_test_")||stripeKey.startsWith("rk_test_")
            ?"test"
            :"unknown";
        verifiedAt=new Date().toISOString();
      }catch(e){
        lastError=clean(e instanceof Error?e.message:e,800);
        return out({error:"Stripe verification failed",detail:lastError},400);
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

    await serviceDb.from("audit_events").insert({
      organization_id:membership.organization_id,
      actor_user_id:user.id,
      event_type:activate?"integration.activated":"integration.configured",
      entity_type:"tenant_integration",
      entity_id:integration.id,
      payload:{
        channel:integration.channel,
        provider:integration.provider,
        status:updated.status,
        last_verified_at:updated.last_verified_at||null
      }
    });

    return out({ok:true,integration:updated});
  }catch(e){
    console.error(e);
    return out({error:"Integration update failed",detail:clean(e instanceof Error?e.message:e,1000)},500);
  }
});
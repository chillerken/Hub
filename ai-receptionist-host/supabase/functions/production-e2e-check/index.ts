import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});

Deno.serve(async (req:Request)=>{
  if(req.method!=="POST") return json({error:"Method"},405);
  try{
    const auth=req.headers.get("authorization")||"";
    if(!auth.toLowerCase().startsWith("bearer ")) return json({error:"Unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const secrets=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    const serviceKey=secrets.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await userDb.auth.getUser();
    if(userError||!user) return json({error:"Unauthorized"},401);

    const db=createClient(url,serviceKey,{auth:{persistSession:false}});
    const {data:membership}=await db.from("memberships")
      .select("organization_id,role").eq("user_id",user.id).eq("active",true).limit(1).maybeSingle();
    if(!membership||!["owner","admin"].includes(String(membership.role||"").toLowerCase()))
      return json({error:"Forbidden"},403);

    const body=await req.json().catch(()=>({}));
    const widgetToken=String(body.widget_token||"").trim();
    const message=String(body.message||"").trim().slice(0,1200);
    if(!widgetToken||!message) return json({error:"widget_token and message required"},400);

    const {data:profile}=await db.from("business_profiles")
      .select("organization_id,widget_allowed_domains").eq("widget_token",widgetToken)
      .eq("widget_enabled",true).maybeSingle();
    if(!profile||profile.organization_id!==membership.organization_id)
      return json({error:"Widget not found for your organization"},404);

    const testId="prod-e2e-"+crypto.randomUUID();
    const origin=String(body.origin||"https://www.luxwash.online");
    const chatUrl=url+"/functions/v1/public-reception-chat";
    const response=await fetch(chatUrl,{method:"POST",headers:{"content-type":"application/json","origin":origin},body:JSON.stringify({widget_token:widgetToken,message:"["+testId+"] "+message})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok) return json({ok:false,test_id:testId,chat_status:response.status,error:result?.error||"Production chat failed"},502);

    const leadId=result?.lead_id;
    const conversationId=result?.conversation_id;
    if(!leadId||!conversationId||!result?.reply)
      return json({ok:false,test_id:testId,error:"Production chat returned incomplete receipt"},502);

    const [{data:lead},{data:messages},{data:appointments},{data:handoffs}]=await Promise.all([
      db.from("leads").select("id,status,score,summary").eq("id",leadId).eq("organization_id",profile.organization_id).maybeSingle(),
      db.from("messages").select("id,role,content").eq("conversation_id",conversationId).eq("organization_id",profile.organization_id).order("created_at",{ascending:true}),
      db.from("appointments").select("id,status").eq("lead_id",leadId).eq("organization_id",profile.organization_id),
      db.from("handoffs").select("id,status").eq("lead_id",leadId).eq("organization_id",profile.organization_id)
    ]);

    const verified=!!lead&&Array.isArray(messages)&&messages.some((m:any)=>m.role==="customer")&&messages.some((m:any)=>m.role==="assistant");

    if(body.cleanup===true){
      await db.from("workflow_actions").delete().eq("lead_id",leadId).eq("organization_id",profile.organization_id);
      await db.from("tasks").delete().eq("lead_id",leadId).eq("organization_id",profile.organization_id);
      await db.from("handoffs").delete().eq("lead_id",leadId).eq("organization_id",profile.organization_id);
      await db.from("appointments").delete().eq("lead_id",leadId).eq("organization_id",profile.organization_id);
      await db.from("messages").delete().eq("conversation_id",conversationId).eq("organization_id",profile.organization_id);
      await db.from("conversations").delete().eq("id",conversationId).eq("organization_id",profile.organization_id);
      await db.from("leads").delete().eq("id",leadId).eq("organization_id",profile.organization_id);
    }

    return json({ok:verified,test_id:testId,receipt:{lead_id:leadId,conversation_id:conversationId,lead_status:lead?.status,score:lead?.score,message_roles:(messages||[]).map((m:any)=>m.role),appointment_count:appointments?.length||0,handoff_count:handoffs?.length||0,ai_reply_present:!!result.reply,cleaned_up:body.cleanup===true}});
  }catch(e){return json({error:"Internal error",detail:String(e?.message||e)},500)}
});
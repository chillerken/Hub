import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const J=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  const runnerToken=req.headers.get("x-runner-token")||"";
  if(!runnerToken)return J({error:"unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,service,{auth:{persistSession:false}});
  const {data:valid,error:tokenError}=await db.rpc("validate_workflow_runner_token",{p_token:runnerToken});
  if(tokenError||valid!==true)return J({error:"unauthorized"},401);
  const key=Deno.env.get("GEMINI_API_KEY")||"";
  if(!key)return J({ok:false,key_configured:false},503);

  const attempts:any[]=[];
  let selected="";
  for(const model of ["gemini-3.5-flash-lite","gemini-3.1-flash-lite"]){
    const started=Date.now();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),9000);
    try{
      const resp=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{
        method:"POST",
        signal:controller.signal,
        headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
        body:JSON.stringify({contents:[{role:"user",parts:[{text:"Geef JSON met exact key ok en waarde true."}]}],generationConfig:{maxOutputTokens:64,temperature:0,responseMimeType:"application/json"}})
      });
      const body=await resp.json().catch(()=>({}));
      const reply=String(body?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"").trim();
      attempts.push({model,http_status:resp.status,reply_length:reply.length,latency_ms:Date.now()-started});
      let validReply=false;
      try{validReply=JSON.parse(reply)?.ok===true;}catch{}
      if(resp.ok&&validReply){selected=model;break;}
      if(!([404,408,429].includes(resp.status)||resp.status>=500))break;
    }catch{
      attempts.push({model,network_error:true,latency_ms:Date.now()-started});
    }finally{
      clearTimeout(timer);
    }
  }
  return J({ok:Boolean(selected),selected_model:selected||null,attempts},selected?200:502);
});
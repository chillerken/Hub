// Read-only provider probes. Never log keys, provider response bodies or customer data.
module.exports=async function diagnostics(config){
 const result={openai:{configured:Boolean(config.openaiKey),model:config.openaiModel},email:{configured:Boolean(config.resend.apiKey&&config.resend.from)}};
 await Promise.allSettled([
  (async()=>{if(!config.openaiKey)return;try{const r=await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(config.openaiModel),{headers:{Authorization:`Bearer ${config.openaiKey}`},signal:AbortSignal.timeout(10000)});result.openai.model_accessible=r.ok;result.openai.status=r.status;}catch{result.openai.model_accessible=false;result.openai.status='timeout';}})(),
  (async()=>{if(!config.resend.apiKey)return;try{const r=await fetch('https://api.resend.com/domains',{headers:{Authorization:`Bearer ${config.resend.apiKey}`},signal:AbortSignal.timeout(10000)});result.email.domain_check_status=r.status;if(r.ok){const d=await r.json();const domain=String(config.resend.from).match(/@([^>\s]+)/)?.[1]?.toLowerCase();result.email.domain_verified=(d.data||[]).some(x=>x.name.toLowerCase()===domain&&x.status==='verified');}}catch{result.email.domain_check_status='timeout';}})()
 ]);
 return result;
};

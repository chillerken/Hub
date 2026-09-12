// One small inference at startup verifies processing, not just model visibility.
// Never log keys, provider response bodies or customer data.
let latest=null;
module.exports=async function diagnostics(config){
 const result={access:{admin_password_configured:Boolean(config.adminPassword&&config.adminPassword.length>=12),cookie_secret_configured:Boolean(config.cookieSecret&&config.cookieSecret.length>=32)},openai:{configured:Boolean(config.openaiKey),model:config.openaiModel},email:{configured:Boolean(config.resend.apiKey&&config.resend.from)}};
 await Promise.allSettled([
  (async()=>{if(!config.openaiKey)return;try{const r=await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(config.openaiModel),{headers:{Authorization:`Bearer ${config.openaiKey}`},signal:AbortSignal.timeout(10000)});result.openai.model_accessible=r.ok;result.openai.status=r.status;}catch{result.openai.model_accessible=false;result.openai.status='timeout';}})(),
  (async()=>{const probe=await require('./classify')(config)('Ik wil informatie over autoreiniging.');result.openai.inference_available=probe.available;result.openai.inference_error=probe.error_code||null;})(),
  (async()=>{if(!config.resend.apiKey)return;try{const r=await fetch('https://api.resend.com/domains',{headers:{Authorization:`Bearer ${config.resend.apiKey}`},signal:AbortSignal.timeout(10000)});result.email.domain_check_status=r.status;const d=await r.json();if(!r.ok&&/^[a-z_]{1,64}$/.test(d.name||''))result.email.domain_check_error=d.name;if(r.ok){const domain=String(config.resend.from).match(/@([^>\s]+)/)?.[1]?.toLowerCase();result.email.domain_verified=(d.data||[]).some(x=>x.name.toLowerCase()===domain&&x.status==='verified');}}catch{result.email.domain_check_status='timeout';}})()
 ]);
 latest={...result,checked_at:new Date().toISOString()};return latest;
};

module.exports.getLatest=()=>latest;

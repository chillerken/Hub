const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
module.exports=function database(config){
 return async function db(action,payload={}){
  const response=await fetch(`${config.supabase.url.replace(/\/$/,'')}/rest/v1/rpc/luxwash_rpc`,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabase.publishableKey},body:JSON.stringify({p_secret:config.supabase.appSecret,p_action:action,p_payload:payload}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok){const e=new Error(data.message||'Databasefout');e.code=data.code;e.status=data.code==='23P01'?409:data.code==='42501'?403:400;throw e;}return data;
 }
};
module.exports.hash=hash;

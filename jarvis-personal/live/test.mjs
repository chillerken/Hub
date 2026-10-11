import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import worker from './worker.js';

const userId='test-owner-1',org='da9cf302-2af6-4a20-a422-ae03e09c2c87';
let authCalls=0,modelCalls=0;
globalThis.fetch=async (input,opts={})=>{
  const u=new URL(input), token=opts.headers?.Authorization;
  assert.equal(u.hostname,'ndecxbsrxspkuxjsbndq.supabase.co');
  assert.ok(opts.headers?.apikey?.startsWith('sb_publishable_'));
  assert.equal(opts.cache,'no-store');
  authCalls++;
  if(u.pathname==='/auth/v1/user'){
    if(token==='Bearer user-owner-jwt')return Response.json({id:userId});
    if(token==='Bearer user-reader-jwt')return Response.json({id:'test-reader-2'});
    return Response.json({message:'unauthorized'},{status:401});
  }
  if(u.pathname==='/rest/v1/memberships'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    if(token==='Bearer user-owner-jwt')return Response.json([{user_id:userId,organization_id:org,active:true,role:'owner'}]);
    if(token==='Bearer user-reader-jwt')return Response.json([{user_id:'test-reader-2',organization_id:org,active:true,role:'reader'}]);
  }
  throw Error('Unexpected auth path');
};
const env={AI:{async run(model,options){modelCalls++;assert.ok(model.includes('llama'));assert.equal(options.messages.at(-1).content,'Dag JARVIS');return {response:'Dag! AI antwoordt.'};}}};
const run=(path,options)=>worker.fetch(new Request('https://jarvis-test.example'+path,options),env);
function post(messages,token='user-owner-jwt'){return {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({messages})};}
const health=await run('/api/health');
assert.equal(health.status,200);
const h=await health.json();
assert.equal(h.version,'1.3.0');assert.equal(h.aiConfigured,true);assert.equal(h.auth,'reception-ai-login');
assert.equal((await run('/api/chat')).status,405);
assert.equal((await run('/api/chat',{method:'POST',body:'{}'})).status,401);
assert.equal((await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}],'wrong-jwt'))).status,401);
assert.equal((await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}],'user-reader-jwt'))).status,403);
assert.equal(modelCalls,0);
let response=await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}]));
assert.equal(response.status,200);assert.equal((await response.json()).response,'Dag! AI antwoordt.');
assert.equal(modelCalls,1);assert.ok(authCalls>=5);
assert.equal((await run('/api/chat',post([{role:'assistant',content:'No user message'}]))).status,400);
assert.equal((await run('/api/chat',{method:'POST',headers:{Authorization:'Bearer user-owner-jwt'},body:'{broken'})).status,400);
const bad=new Request('https://jarvis-test.example/api/chat',{method:'POST',headers:{Authorization:'Bearer user-owner-jwt','Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'x'.repeat(13000)}]})});
assert.equal((await worker.fetch(bad,env)).status,413);
assert.equal((await worker.fetch(new Request('https://jarvis-test.example/api/chat',post([{role:'user',content:'Dag JARVIS'}])),{})).status,503);
const page=await run('/');assert.equal(page.status,200);
const html=await page.text();
assert.ok(html.includes('id="aiLoginShortcut"'));
assert.ok(html.includes('id="lwReceptionLogin"'));
assert.ok(html.includes('id="lwTomorrow"'));
assert.ok(html.includes('window.JarvisAuth=Object.freeze'));
assert.ok(!html.includes('id="saveKey"'));
assert.ok(!html.includes('Persoonlijke AI-toegangscode'));
for(const [,js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(js,{filename:'jarvis-inline.js'});
assert.ok(page.headers.get('Content-Security-Policy').includes('ndecxbsrxspkuxjsbndq.supabase.co'));
for(const [path,substring] of [['/manifest.webmanifest','JARVIS Personal OS'],['/sw.js','jarvis-personal-v11'],['/icon.svg','<svg']]){
  const r=await run(path);assert.equal(r.status,200);assert.ok((await r.text()).includes(substring));
}
assert.equal((await run('/missing')).status,404);
console.log('JARVIS v1.3 tests OK: JWT auth, admin membership, denied access, AI response, invalid inputs, front-end JS syntax, PWA routes.');

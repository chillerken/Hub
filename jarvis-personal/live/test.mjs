import assert from 'node:assert/strict';
import worker from './worker.js';

const url = path => 'https://jarvis-test.example' + path;
const req = (path, init) => new Request(url(path), init);
const env = {
  JARVIS_ACCESS_KEY: 'unit-test-only-not-a-real-secret',
  AI: { async run(_model, options) {
    assert.equal(options.messages.at(-1).content, 'Dag JARVIS');
    return {response: 'Dag! Ik ben actief.'};
  }}
};
async function call(path, init, environment=env) {return worker.fetch(req(path,init),environment);}
function post(messages, token=env.JARVIS_ACCESS_KEY) {
  return {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body:JSON.stringify({messages})};
}
const health=await call('/api/health');
assert.equal(health.status,200);
const json=await health.json();
assert.equal(json.ok,true);
assert.equal(json.version,'1.2.0');
assert.equal(json.aiConfigured,true);
const withoutKey=await call('/api/health',undefined,{AI:env.AI});
assert.equal((await withoutKey.json()).aiConfigured,false);
assert.equal((await call('/api/chat')).status,405);
assert.equal((await call('/api/chat',post([{role:'user',content:'Dag JARVIS'}],'incorrect'))).status,401);
const chat=await call('/api/chat',post([{role:'user',content:'Dag JARVIS'}]));
assert.equal(chat.status,200);
assert.equal((await chat.json()).response,'Dag! Ik ben actief.');
assert.equal((await call('/api/chat',post([{role:'assistant',content:'wrong end'}]))).status,400);
assert.equal((await call('/api/chat',{method:'POST',headers:{'Authorization':'Bearer '+env.JARVIS_ACCESS_KEY,'Content-Type':'application/json'},body:'{garbled'})).status,400);
const root=await call('/');
assert.equal(root.status,200);
const html=await root.text();
assert.ok(html.includes('taskDue'));
assert.ok(html.includes('id="lwReceptionLogin"'));
assert.ok(html.includes('id="lwCrmLogin"'));
assert.ok(html.includes('Beveiligde toegang via je bestaande Supabase-accounts'));
assert.ok(root.headers.get('Content-Security-Policy')?.includes('https://ndecxbsrxspkuxjsbndq.supabase.co'));
assert.ok(root.headers.get('Content-Security-Policy')?.includes('https://nahwlhptgdkwhjcfkhkt.supabase.co'));
assert.ok(html.includes('Herinneringen werken zolang JARVIS geopend is'));
assert.ok(root.headers.get('Content-Security-Policy')?.includes("frame-src 'none'"));
for(const [path,content] of [['/manifest.webmanifest','JARVIS Personal OS'],['/sw.js','jarvis-personal-v11'],['/icon.svg','<svg']]){
  const res=await call(path);assert.equal(res.status,200);assert.ok((await res.text()).includes(content));
}
assert.equal((await call('/does-not-exist')).status,404);
console.log('JARVIS v1.2: 18 route/auth/validation/offline tests geslaagd.');

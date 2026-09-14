const {test}=require('node:test');
const assert=require('node:assert/strict');

// This file runs with test-only credentials and never starts the worker or providers.
Object.assign(process.env,{
 NODE_ENV:'test',SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test-only',
 SUPABASE_APP_SECRET:'test-only-'.repeat(4),COOKIE_SECRET:'login-test-only-'.repeat(3),
 ADMIN_PASSWORD:'isolated-login-test-password',CRON_SECRET:'login-test-only-'.repeat(3),
 OPENAI_API_KEY:'',RESEND_API_KEY:'',WHATSAPP_TOKEN:'',CENTRAL_DASHBOARD:''
});
const config=require('../src/config');
const {server}=require('../server');

test('Beheerlogin: native-form headers, origins, password and protected session',async t=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 config.baseUrl=origin;
 const login=await fetch(origin+'/admin/login');
 assert.equal(login.status,200);
 assert.equal(login.headers.get('referrer-policy'),'same-origin');
 assert.match(login.headers.get('content-security-policy'),/form-action 'self'/);
 assert.match(await login.text(),/method="post" action="\/admin\/login"/);

 async function post(from,password=config.adminPassword){
  return fetch(origin+'/admin/login',{method:'POST',redirect:'manual',
   headers:{Origin:from,'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({password})});
 }
 for(const from of ['null','https://attacker.example',origin+'.attacker.example','not-an-origin']){
  const rejected=await post(from);
  assert.equal(rejected.status,403,from+' must not be trusted');
  assert.equal(rejected.headers.get('set-cookie'),null);
 }
 const incorrect=await post(origin,'incorrect-test-password');
 assert.equal(incorrect.status,401);
 assert.equal(incorrect.headers.get('referrer-policy'),'same-origin','Retry page keeps form submissions working');
 assert.equal(incorrect.headers.get('set-cookie'),null);
 const success=await post(origin);
 assert.equal(success.status,302);
 assert.equal(success.headers.get('location'),'/cockpit');
 const cookie=success.headers.get('set-cookie');
 assert.match(cookie,/^aba_admin=/);
 assert.match(cookie,/HttpOnly/);
 assert.match(cookie,/SameSite=Strict/);
 assert.match(cookie,/Max-Age=43200/);
 const authenticated=await fetch(origin+'/cockpit',{headers:{Cookie:cookie.split(';')[0]}});
 assert.equal(authenticated.status,200);
 assert.match(await authenticated.text(),/central.js/);
 const protectedPage=await fetch(origin+'/cockpit',{redirect:'manual'});
 assert.equal(protectedPage.status,302,'A separate client still needs authentication');

 config.centralDashboard=true;
 for(const [path,section] of [['/admin/login?token=invalid-test-token','overzicht'],['/admin/leads','leads'],['/admin/appointments','calendar'],['/admin/activity','audit_logs'],['/cockpit','overzicht']]){
  const moved=await fetch(origin+path,{redirect:'manual'});
  assert.equal(moved.status,302);
  assert.equal(moved.headers.get('location'),'https://www.luxwash.online/controle#'+section);
  assert.equal(moved.headers.get('set-cookie'),null);
 }
 const stillPrivate=await fetch(origin+'/api/core/admin/list?table=customers');
 assert.equal(stillPrivate.status,401,'Consolidation must never grant access to customer data');
});

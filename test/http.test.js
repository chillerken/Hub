const {test}=require('node:test');
const assert=require('node:assert/strict');
test('Echte HTTP-server: boekingsscherm, bundel, admin- en webhookbeveiliging',async t=>{
 // Configuration only: this test makes no external database/provider calls.
 Object.assign(process.env,{SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test-only',SUPABASE_APP_SECRET:'test-only-secret',NODE_ENV:'test'});
 const {server}=require('../server');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const page=await fetch(base+'/boeken');assert.equal(page.status,200);assert.match(await page.text(),/central.js/);
 const bundle=await fetch(base+'/central.js');assert.equal(bundle.status,200);assert.match(bundle.headers.get('content-type'),/javascript/);
 const admin=await fetch(base+'/api/core/admin/list?table=customers');assert.equal(admin.status,401);
 const invalid=await fetch(base+'/api/lina/event',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(invalid.status,401);
 const cockpit=await fetch(base+'/cockpit',{redirect:'manual'});assert.equal(cockpit.status,302);
});

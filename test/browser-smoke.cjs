// Isolated browser checks. Fixtures never reach Supabase or any real provider.
const assert=require('node:assert/strict');
Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test-only',SUPABASE_APP_SECRET:'test-only-'.repeat(4),COOKIE_SECRET:'browser-test-only-'.repeat(3),ADMIN_PASSWORD:'browser-test-password',CRON_SECRET:'browser-test-only-'.repeat(3),OPENAI_API_KEY:'',RESEND_API_KEY:'',WHATSAPP_TOKEN:''});
const {chromium}=require('playwright');
const {server}=require('../server');
const {makeAdminCookie}=require('../src/auth');
const sid='00000000-0000-4000-8000-000000000001',qid='00000000-0000-4000-8000-000000000002';
const quote={id:qid,title:'TEST — offerte',customer:{name:'Uitsluitend browsertest'},status:'viewed',expires_at:'2030-01-01T00:00:00Z',notes:'Synthetische gegevens voor een geïsoleerde test.',total_cents:12500,items:[{description:'TEST reiniging',quantity:1,unit_cents:12500}],business:{name:'LuxWash TEST',phone:'000',email:'test@example.invalid',website:'https://example.invalid'}};
const catalog=[{id:sid,name:'TEST terrasreiniging',price_mode:'quote',duration_minutes:90,prices:[]}];
const flow={checked_at:new Date().toISOString(),actions:[],events:[],customers:[],sources:[],worker:{checked_at:new Date().toISOString()},integrations:[{name:'TEST koppeling',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:'Geen echte provider gebruikt.'}],metricool:{checked_at:new Date().toISOString(),publication_error:'TEST: accountlimiet'}};
let browser,checks=0;
async function noOverflow(page,label){
 const layout=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
 assert.ok(layout.document<=layout.width+2,label+': horizontal overflow '+JSON.stringify(layout));checks++;
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:360,height:800},{width:390,height:844},{width:1280,height:900}]){
  const context=await browser.newContext({viewport});
  const page=await context.newPage(),errors=[],calls=[],social=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort('blockedbyclient');
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const req=route.request(),body=req.method()==='POST'?req.postDataJSON():undefined;
   calls.push({path:url.pathname,body});
   let data;
   if(url.pathname==='/api/core/catalog')data={services:catalog};
   else if(url.pathname==='/api/core/admin/list')data={rows:[]};
   else if(url.pathname==='/api/core/admin/flow')data=flow;
   else if(url.pathname==='/api/core/admin/social'){
    if(body)social.push({...body,id:'test-social',status:'draft'});
    data=body?{id:'test-social',status:'draft'}:{rows:social};
   }else if(url.pathname==='/api/core/request')data={id:'test-request',status:'received'};
   else if(url.pathname==='/api/core/quote')data={...quote,status:body?.decision||quote.status};
   else return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Unexpected test request: '+url.pathname})});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  // Requests made through APIRequestContext are not intercepted: these are real local authorization checks.
  for(const path of ['/api/core/admin/flow','/api/core/admin/social','/api/core/admin/calendar.ics']){
   const response=await context.request.get(origin+path);assert.equal(response.status(),401);checks++;
  }
  await page.goto(origin+'/cockpit');assert.equal(new URL(page.url()).pathname,'/admin/login');checks++;
  await page.goto(origin+'/boeken');
  await page.getByLabel('Dienst',{exact:true}).selectOption(sid);
  await page.getByLabel('Uw naam',{exact:true}).fill('TEST ONLY');
  await page.getByLabel('E-mail',{exact:true}).fill('browser@example.invalid');
  await page.getByLabel('Telefoon',{exact:true}).fill('0468000000');
  await page.getByLabel('Straat en huisnummer',{exact:true}).fill('TESTSTRAAT 1');
  await page.getByLabel('Postcode',{exact:true}).fill('9340');
  await page.getByLabel('Te reinigen object',{exact:true}).fill('Terras');
  await page.getByLabel('Opmerkingen',{exact:true}).fill('Groene aanslag — browsertest');
  await page.getByLabel('Oppervlakte in m² (indien relevant)').fill('35');
  await page.getByLabel('Materiaal',{exact:true}).fill('Betontegels');
  await page.getByLabel('Zoeken vanaf',{exact:true}).fill('2030-01-01');
  await noOverflow(page,'booking '+viewport.width);
  assert.equal(await page.getByLabel('Stuur mij af en toe een onderhoudsuitnodiging (optioneel)').isChecked(),false);checks++;
  await page.getByRole('button',{name:'Offerte aanvragen',exact:true}).click();
  await page.getByRole('heading',{name:'Uw aanvraag is ontvangen.'}).waitFor();
  const captured=calls.find(c=>c.path==='/api/core/request').body;
  assert.equal(String(captured.area_m2),'35');assert.equal(captured.surface_material,'Betontegels');assert.equal(captured.marketing_consent,false);checks++;
  assert.equal(calls.some(c=>c.path==='/api/core/book'),false);checks++;
  await page.goto(origin+'/offerte#'+qid+'/'+'t'.repeat(40));
  const accept=page.getByRole('button',{name:'Offerte accepteren',exact:true});
  await accept.waitFor();assert.equal(await accept.isEnabled(),false);checks++;
  await noOverflow(page,'quote '+viewport.width);
  await page.getByRole('checkbox').check();await accept.click();
  await page.getByText('Uw akkoord is opgeslagen.',{exact:false}).waitFor();
  assert.ok(calls.some(c=>c.path==='/api/core/quote'&&c.body.decision==='accepted'&&c.body.confirmed===true));checks++;
  await context.addCookies([{name:'aba_admin',value:makeAdminCookie(process.env.COOKIE_SECRET),url:origin,httpOnly:true,sameSite:'Strict'}]);
  await page.goto(origin+'/cockpit');
  await page.getByRole('heading',{name:'Vandaag bij LuxWash'}).waitFor();
  await page.getByRole('heading',{name:/Actie vereist/}).waitFor();
  await noOverflow(page,'dashboard '+viewport.width);
  await page.getByRole('button',{name:'Automatiseringen',exact:true}).last().click();
  await page.getByRole('heading',{name:'Wat loopt automatisch?'}).waitFor();
  await noOverflow(page,'automations '+viewport.width);
  if(viewport.width<761)await page.getByRole('button',{name:'Menu openen'}).click();
  await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('button',{name:'Social Media'}).click();
  await page.getByRole('heading',{name:'Contentconcept toevoegen'}).waitFor();
  await page.getByLabel('Onderwerp',{exact:true}).fill('TEST ONLY');
  await page.getByLabel('Tekst en CTA',{exact:true}).fill('Uitsluitend een testconcept, niet publiceren.');
  await page.getByRole('button',{name:'Concept opslaan'}).click();
  await page.getByText('Concept opgeslagen. Nog niet gepland of gepubliceerd.',{exact:true}).waitFor();checks++;
  await noOverflow(page,'social '+viewport.width);
  // Emulate 200% text sizing without modifying production source.
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  await noOverflow(page,'social 200% text '+viewport.width);
  assert.deepEqual(errors,[],'No uncaught browser errors');checks++;
  await context.close();
 }
 console.log('BROWSER PASS: '+checks+' checks across 360px, 390px and 1280px; isolated fixtures, no live sends or database writes.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});

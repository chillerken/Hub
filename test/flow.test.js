const {test}=require('node:test');
const assert=require('node:assert/strict');
const {quoteToken,integrations,calendarExport}=require('../src/core/flow');
const makeFlow=require('../src/core/flow');
const makeAutomation=require('../src/core/automation');
const crypto=require('node:crypto');
test('Offertelink is deterministisch, domeingescheiden en vereist sterke serversleutel',()=>{
 const id=crypto.randomUUID(),key='test-only-'.repeat(4);
 assert.equal(quoteToken(id,key),quoteToken(id,key));
 assert.notEqual(quoteToken(id,key),quoteToken(crypto.randomUUID(),key));
 assert.throws(()=>quoteToken(id,'short'));
});
test('Koppelingsstatus presenteert configuratie nooit als succesvolle uitvoering',()=>{
 const rows=integrations({resend:{apiKey:'test',from:'test@example.invalid'}},{checked_at:'2026-09-14T00:00:00Z',openai:{inference_available:false,inference_error:'insufficient_quota'}});
 assert.equal(rows.find(x=>x.name==='AI-klantenservice').status,'FOUT');
 assert.notEqual(rows.find(x=>x.name==='E-mail').status,'LIVE');
 assert.notEqual(rows.find(x=>x.name==='WhatsApp Business').status,'LIVE');
});
test('Agenda-export ontsnapt klanttekst en heeft stabiele UIDs en UTC-tijden',()=>{
 const value=calendarExport([{id:'appt',customer_id:'c',catalog_service_id:'s',starts_at:'2026-09-20T09:00:00+02:00',ends_at:'2026-09-20T10:00:00+02:00',status:'cancelled',address:'Straat 1\nBEGIN:VEVENT',updated_at:'2026-09-14T00:00:00Z'}],[{id:'c',name:'Klant, één; twee'}],[{id:'s',name:'Reiniging'}]);
 assert.match(value,/UID:appt@luxwash.online/);assert.match(value,/DTSTART:20260920T070000Z/);assert.match(value,/STATUS:CANCELLED/);
 assert.equal(value.split('\r\n').filter(l=>l==='BEGIN:VEVENT').length,1);
 assert.match(value,/Klant\\, één\\; twee/);
 for(const line of value.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('Offertekeuze vereist apart expliciet akkoord en levert nooit tokens aan database',async()=>{
 const calls=[],id=crypto.randomUUID();
 const route=makeFlow({cookieSecret:'test-only-'.repeat(4),baseUrl:'https://example.invalid'},async(a,p)=>{calls.push({a,p});return {status:'accepted'};});
 await assert.rejects(route({method:'POST'},{},{json(){}},'/api/core/quote',{id,token:'t'.repeat(40),decision:'accepted'}));
 assert.equal(calls.length,0);
 await route({method:'POST'},{},{json(){}},'/api/core/quote',{id,token:'t'.repeat(40),decision:'accepted',confirmed:true});
 assert.equal(calls[0].a,'quote_decide');assert.match(calls[0].p.token_hash,/^[a-f0-9]{64}$/);assert.equal(calls[0].p.token,undefined);
});
test('Offertemail gebruikt uitsluitend een op de server opgebouwde beheerlink',async()=>{
 const calls=[],id=crypto.randomUUID(),outputs=[];
 const route=makeFlow({cookieSecret:'test-only-'.repeat(4),baseUrl:'https://example.invalid'},async(a,p)=>{calls.push({a,p});return {id};});
 await route({method:'POST'},{},{json(r,s,d){outputs.push(d)}},'/api/core/admin/delivery',{action:'quote_send',id,accept_url:'https://attacker.invalid/'});
 assert.equal(calls[0].a,'quote_publish');assert.equal(calls[1].a,'quote_send');assert.ok(calls[1].p.accept_url.startsWith('https://example.invalid/offerte#'));
});
for(const permitted of [true,false,null])test('Verzending hercontroleert toestemming: '+permitted,async t=>{
 let sent=0,finished;
 const job={id:'test-job',kind:'lead_ack',attempts:1,lease_token:'test-lease',payload:{service:'Terras'}};
 t.mock.method(globalThis,'fetch',async()=>{sent++;return {ok:true,json:async()=>({id:'test-mail'})}});
 const db=async(a,p)=>{
  if(a==='email_budget')return {allowed:true};
  if(a==='claim_jobs')return[job];
  if(a==='settings')return {business:{name:'LuxWash',phone:'053896400',email:'test@example.invalid'},planning:{}};
  if(a==='job_context')return {job,customer:{id:'c',name:'Test',email:'qa@example.org',status:'active'}};
  if(a==='flow_delivery_allowed')return permitted===null?{}:{allowed:permitted};
  if(a==='finish_job')finished=p;
  return {};
 };
 await makeAutomation({resend:{apiKey:'test',from:'test@example.invalid'}},db).run();
 assert.equal(sent,permitted===true?1:0);assert.equal(finished.status,permitted===true?'sent':'skipped');
});
test('Leadbevestiging is geen afspraakbevestiging',()=>{
 const msg=makeAutomation.formatMessage({job:{kind:'lead_ack',payload:{service:'Terras'}},customer:{name:'Test'}},{business:{phone:'test',email:'test@example.invalid'},planning:{repeat_weeks:6}},{});
 assert.match(msg.text,/nog geen afspraakbevestiging/);
});

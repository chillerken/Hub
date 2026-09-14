const {test}=require('node:test');
const assert=require('node:assert/strict');
const {basicReply,areaIn}=require('../src/core/basic-replies');
const settings={ai:{greeting:'Hallo! Welke reiniging zoekt u?'},business:{name:'LuxWash TEST',phone:'000-test',email:'test@example.invalid',area:'TEST werkgebied'}};
const terrace={id:'test-terrace',name:'Terrasreiniging',price_mode:'quote',prices:[{amount_cents:475,currency:'EUR',unit:'m²',category:'standard'}]};
const driveway={id:'test-driveway',name:'Opritreiniging',price_mode:'quote',prices:[]};
function testDb(history=[]){
 const calls=[];return {calls,db:async(action,p)=>{
  calls.push({action,p});
  if(action==='session')return {id:'isolated-session',messages:history};
  if(action==='settings')return settings;
  if(action==='catalog')return [terrace,driveway];
  return {ok:true};
 }};
}
test('Hallo works with no AI key or network and saves both messages without an incident',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);
 global.fetch=async()=>{throw new Error('No provider should be contacted for a greeting');};
 for(const openaiKey of ['', 'test-only']){
  const {db,calls}=testDb();const ai=require('../src/core/ai')({openaiKey},db);
  const result=await ai.answer('Hallo','test-only-session-token');
  assert.equal(result.mode,'basic');assert.equal(result.handoff,false);
  assert.equal(result.answer,settings.ai.greeting);
  assert.deepEqual(calls.filter(c=>c.action==='message').map(c=>c.p.direction),['inbound','outbound']);
  assert.equal(calls.some(c=>['handoff','save','book','customer_create','catalog'].includes(c.action)),false);
 }
});
test('Basic prices are computed from the current catalog and keep the area across turns',async()=>{
 assert.equal(areaIn('Mijn terras is ongeveer 35 m².'),35);
 assert.equal(areaIn('En voor 35m²?'),35);
 assert.equal(areaIn('20,5 vierkante meter'),20.5);
 assert.equal(areaIn('0 m²'),null);
 const {db,calls}=testDb([{direction:'inbound',content:'Mijn terras heeft groene aanslag'}]);
 const result=await require('../src/core/ai')({openaiKey:''},db).answer('En hoeveel voor 35 m²?','test-only-session-token');
 assert.equal(result.mode,'basic');assert.match(result.answer,/Terrasreiniging/);
 assert.match(result.answer,/4,75/);assert.match(result.answer,/166,25/);
 assert.match(result.answer,/35 m²/);assert.match(result.answer,/definitieve prijs/);
 assert.match(result.answer,/geen afspraak geboekt/);
 assert.equal(calls.some(c=>['book','handoff','customer_create','quote_draft'].includes(c.action)),false);
});
test('Catalog edits change the answer; unknown prices and inactive services are not invented',async()=>{
 const r=await basicReply('Wat kost terrasreiniging?',settings,[],async()=>[{...terrace,prices:[{amount_cents:650,currency:'EUR',unit:'m²'}]}]);
 assert.match(r.answer,/6,50/);assert.doesNotMatch(r.answer,/4,75/);
 const unknown=await basicReply('Wat kost opritreiniging?',settings,[],async()=>[driveway]);
 assert.match(unknown.answer,/prijs op aanvraag/);assert.doesNotMatch(unknown.answer,/€/);
 assert.equal(await basicReply('Wat kost terrasreiniging?',settings,[],async()=>[{...terrace,active:false}]),null);
});
test('Private data, booking, changes, complaints and material safety never use basic facts as a decision',async()=>{
 for(const message of [
  'Boek terrasreiniging morgen om 10 uur','Annuleer mijn afspraak','Mijn naam is Voorbeeld',
  'Mijn email is private@example.invalid','Is terrasreiniging veilig voor natuursteen?',
  'Ik heb schade aan mijn terras','Maak een offerte voor mijn terras',
  'Hallo, annuleer mijn afspraak','Wat kost dakreiniging?'
 ]){
  const result=await basicReply(message,settings,[],async()=>[terrace,driveway]);
  assert.equal(result,null,message);
 }
});
test('Public contact and working area only quote settings and make no availability claim',async()=>{
 const fail=async()=>{throw new Error('No catalog lookup expected');};
 const contact=await basicReply('Hoe kan ik jullie bereiken?',settings,[],fail);
 assert.match(contact.answer,/000-test/);assert.match(contact.answer,/test@example.invalid/);
 const area=await basicReply('Wat is jullie werkgebied?',settings,[],fail);
 assert.match(area.answer,/TEST werkgebied/);assert.match(area.answer,/afzonderlijk.*gecontroleerd/);
});
test('Basic replies fail closed if saving the outbound message fails',async()=>{
 const {db}=testDb();const failing=async(action,p)=>{if(action==='message'&&p.direction==='outbound')throw new Error('storage unavailable');return db(action,p);};
 await assert.rejects(require('../src/core/ai')({openaiKey:''},failing).answer('Hallo','test-token'),/storage unavailable/);
});
test('A complex question still uses the configured AI and a quota error still creates real handoff work',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);
 let requests=0;global.fetch=async()=>{requests++;return new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:429});};
 const {db,calls}=testDb();const ai=require('../src/core/ai')({openaiKey:'test-only',openaiModel:'test-only'},db);
 const result=await ai.answer('Ik wil mijn afspraak verplaatsen','test-token');
 assert.equal(requests,1);assert.equal(result.handoff,true);
 assert.ok(calls.some(c=>c.action==='handoff'));
 assert.ok(calls.some(c=>c.action==='save'&&c.p.data.result.error_code==='insufficient_quota'));
 assert.equal(calls.some(c=>c.action==='appointment_change'),false);
});

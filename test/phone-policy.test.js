const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const policy=require('../src/core/phone-policy');
const details={klant_naam:'QA TEST Astra',telefoonnummer:'+32000000003',regio_gemeente:'Lede',type_reiniging:'terras',doorgestuurd_naar_whatsapp:true,samenvatting_gesprek:'QA TEST: terras van 20 m²; liefst vrijdag. Prijs en planning nog persoonlijk te bevestigen.'};
function database(){
 const call={id:crypto.randomUUID(),provider_call_id:'qa-astra-call',phone:'+32000000003',status:'connected'};
 const actions=[];const claims=new Map();
 const db=async(action,p={})=>{
  actions.push({action,p});
  if(action==='call_start')return {...call};
  if(action==='call_update'){Object.assign(call,p);return {...call};}
  if(action==='tool_claim'){const old=claims.get(p.tool_call_id);if(old)return {claimed:false,action:old};claims.set(p.tool_call_id,{});return {claimed:true};}
  if(action==='tool_finish'){claims.set(p.tool_call_id,{result:p.result});return {ok:true};}
  if(action==='handoff')return {ok:true,id:crypto.randomUUID()};
  throw new Error('Unexpected database action: '+action);
 };return {db,call,actions};
}
test('Astra bootstrap advertises the active policy and excludes booking/payment/messaging mutations',()=>{
 const tools={definitions:require('../src/core/tools').TOOL_DEFS};const b=policy.bootstrap(tools);
 assert.equal(b.assistant_name,'Astra');assert.equal(b.policy_version,'astra-2026-09-21');
 assert.match(b.instructions,/één of twee korte zinnen/);assert.match(b.instructions,/053 89 64 00/);assert.match(b.instructions,/Clean & Shine: Sedan €49/);
 assert.match(b.instructions,/1-zit vanaf €45/);assert.match(b.instructions,/Oprit vanaf €4,50\/m²/);
 assert.match(b.instructions,/Alleen interieur \(Interior Refresh\): Sedan €55, Break\/SUV €65, kleine bestelwagen €75/);
 assert.equal(b.greeting.split(/[.!?]+/).filter(s=>s.trim()).length,2);
 assert.deepEqual(b.tools.map(t=>t.name),['getServices','calculatePrice','checkAvailability','recordCallDetails','createFollowup']);
});
test('Conversation snapshots and final JSON log persist exactly six fields without paid AI calls',async t=>{
 const savedFetch=global.fetch;t.after(()=>global.fetch=savedFetch);global.fetch=()=>{throw new Error('External provider forbidden');};
 const {db,call}=database();
 await policy.execute(db,{},'recordCallDetails',details,{sessionId:call.provider_call_id});
 const loaded=JSON.parse(call.summary);assert.deepEqual(loaded,details);
 const turns=[{role:'customer',content:'Mijn terras is 20 m² en ik woon in Lede.'},{role:'assistant',content:'U kunt een foto sturen via WhatsApp naar 053 89 64 00.'}];
 const a=await policy.finalize(db,{provider_call_id:call.provider_call_id,turns,failed:false});
 assert.equal(a.saved,true);assert.deepEqual(a.call_log,details);assert.equal(call.status,'completed');assert.equal(Object.keys(JSON.parse(call.summary)).length,6);
 await policy.finalize(db,{provider_call_id:call.provider_call_id,turns,failed:false});assert.deepEqual(JSON.parse(call.summary),details);
});
test('Immediate hang-up retains unknown fields and never invents a WhatsApp referral',async()=>{
 const {db,call}=database();call.phone=null;
 const result=await policy.finalize(db,{provider_call_id:call.provider_call_id,turns:[]});
 assert.deepEqual(result.call_log,policy.emptyLog());assert.equal(call.status,'completed');
 const fromCustomer=policy.finalLog({},[{role:'customer',content:'Kan ik WhatsApp gebruiken voor mijn zetel?'}]);
 assert.equal(fromCustomer.doorgestuurd_naar_whatsapp,false);assert.equal(fromCustomer.type_reiniging,'meubel');
 assert.equal(fromCustomer.klant_naam,'');assert.equal(fromCustomer.regio_gemeente,'');
 assert.equal(policy.finalLog({},[{role:'assistant',content:'Wij gebruiken geen WhatsApp-nummer.'}]).doorgestuurd_naar_whatsapp,false);
 assert.equal(policy.finalLog({},[{role:'assistant',content:'Wat is uw WhatsApp-nummer?'}]).doorgestuurd_naar_whatsapp,false);
 assert.equal(policy.finalLog({},[{role:'assistant',content:'WhatsApp werkt niet; neem telefonisch contact op.'}]).doorgestuurd_naar_whatsapp,false);
});
test('Callback requires agreement, has one persistent action per call, and makes no booking',async()=>{
 const {db,call,actions}=database();const ctx={sessionId:call.provider_call_id};
 const args={summary:'QA TEST: bel terug over het terras en vrijdag als voorkeur.',priority:'normal',confirmed_by_customer:true};
 await assert.rejects(policy.execute(db,{},'createFollowup',args,ctx),/terugbelnummer/);
 await policy.execute(db,{},'recordCallDetails',details,ctx);
 await assert.rejects(policy.execute(db,{},'createFollowup',{...args,confirmed_by_customer:false},ctx));
 const first=await policy.execute(db,{},'createFollowup',args,ctx);
 const second=await policy.execute(db,{},'createFollowup',args,ctx);
 assert.equal(first.saved,true);assert.equal(second.id,first.id);assert.equal(second.duplicate,true);
 assert.equal(first.appointment_confirmed,false);assert.equal(first.message_sent,false);
 assert.equal(actions.filter(a=>a.action==='handoff').length,1);
 await assert.rejects(policy.execute(db,{},'createAppointment',{},ctx),/niet beschikbaar/);
});
test('Malformed logs and failed storage never report success',async()=>{
 const {db,call}=database();const ctx={sessionId:call.provider_call_id};
 await assert.rejects(policy.execute(db,{},'recordCallDetails',{...details,extra:'unwanted'},ctx));
 await assert.rejects(policy.execute(db,{},'recordCallDetails',{...details,type_reiniging:'invented'},ctx));
 await assert.rejects(policy.execute(async()=>null,{},'recordCallDetails',details,ctx),/niet worden opgeslagen/);
 await assert.rejects(policy.finalize(async(action)=>action==='call_start'?call:null,{provider_call_id:call.provider_call_id,turns:[]}),/niet worden opgeslagen/);
});
test('Signed phone bootstrap and log routes use Astra while forged signatures are denied',async t=>{
 const makeRoutes=require('../src/core/routes');const {db,call}=database();const oldFetch=global.fetch;t.after(()=>global.fetch=oldFetch);
 global.fetch=async(url,opts)=>{assert.equal(url,'https://database.invalid/rest/v1/rpc/luxwash_rpc');const b=JSON.parse(opts.body);return Response.json(await db(b.p_action,b.p_payload));};
 const secret='qa-test-secret-'.repeat(4);const cfg={baseUrl:'https://phone.invalid',aiMode:'rules',supabase:{url:'https://database.invalid',appSecret:secret},resend:{}};
 const router=makeRoutes(cfg,{});
 async function invoke(path,payload,forged=false){
  const raw=JSON.stringify(payload),ts=String(Math.floor(Date.now()/1000));let response;
  const req={method:'POST',url:path,headers:{'x-luxwash-timestamp':ts,'x-luxwash-signature':forged?'bad':crypto.createHmac('sha256',secret).update(ts+'.'+raw).digest('hex')},async *[Symbol.asyncIterator](){yield raw;}};
  await router.routes(req,{}, {json:(_,status,data)=>response={status,data},sameOrigin:()=>true,isAdmin:()=>false});return response;
 }
 assert.equal((await invoke('/api/lina/bootstrap',{},true)).status,401);
 const bootstrap=await invoke('/api/lina/bootstrap',{});assert.equal(bootstrap.data.assistant_name,'Astra');
 const record=await invoke('/api/lina/tool',{name:'recordCallDetails',arguments:details,context:{sessionId:call.provider_call_id,toolCallId:'qa-tool-record'}});assert.equal(record.data.saved,true);
 const final=await invoke('/api/lina/summary',{provider_call_id:call.provider_call_id,turns:[{role:'customer',content:'Ik wil mijn terras laten reinigen.'}]});
 assert.equal(final.status,200);assert.equal(final.data.saved,true);assert.equal(JSON.parse(call.summary).klant_naam,details.klant_naam);
});

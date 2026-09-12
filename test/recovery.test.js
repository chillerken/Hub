const {test}=require('node:test');const assert=require('node:assert/strict');
const {brusselsInstant,brusselsLocal}=require('../ui/brussels-time');
const {parseCookies}=require('../src/auth');
test('Belgische boeking gebruikt zomer- en winteroffset onafhankelijk van het toestel',()=>{
 assert.equal(brusselsInstant('2026-09-14T09:00'),'2026-09-14T07:00:00.000Z');
 assert.equal(brusselsInstant('2026-12-14T09:00'),'2026-12-14T08:00:00.000Z');
 assert.equal(brusselsLocal('2026-09-14T07:00:00Z'),'2026-09-14T09:00');
 assert.throws(()=>brusselsInstant('2026-03-29T02:30'),/bestaat niet/);
 assert.throws(()=>brusselsInstant('2026-10-25T02:30'),/tweemaal/);
});
test('Ongeldig gecodeerde cookie veroorzaakt geen serverfout',()=>{assert.equal(parseCookies('aba_admin=%E0%A4%A; other=valid').other,'valid');assert.equal(parseCookies('aba_admin=%E0%A4%A').aba_admin,'');});
test('Classificatie maakt quota- en onvolledige antwoorden zichtbaar zonder providertekst te lekken',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);const classify=require('../src/core/classify')({openaiKey:'unit-only',openaiModel:'unit-only'});
 global.fetch=async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'sensitive provider response'}}),{status:429});
 const limited=await classify('Ik wil een afspraak');assert.equal(limited.available,false);assert.equal(limited.error_code,'insufficient_quota');assert.equal(JSON.stringify(limited).includes('sensitive'),false);
 global.fetch=async()=>new Response(JSON.stringify({status:'incomplete',output:[]}));assert.equal((await classify('Boeking')).error_code,'incomplete_output');
 global.fetch=async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({intent:'booking',priority:'normal',sentiment:'neutral',summary:'Klant vraagt een afspraak.',handoff:false})}]}]}));assert.equal((await classify('Boeking')).available,true);
});
test('Offerteboeking vereist expliciet klantakkoord en accepteert geen prijs van browser',()=>{
 const {quoteBooking}=require('../src/core/validation');const crypto=require('node:crypto');
 const value={quote_id:crypto.randomUUID(),service_id:crypto.randomUUID(),duration_minutes:90,postcode:'9340',address:'Voorbeeldstraat 1',starts_at:'2026-09-14T09:00:00+02:00',idempotency_key:crypto.randomUUID(),confirmed_by_customer:true,price_cents:1,admin:true};
 assert.equal(quoteBooking.parse(value).price_cents,undefined);assert.equal(quoteBooking.parse(value).admin,undefined);
 assert.equal(quoteBooking.safeParse({...value,confirmed_by_customer:false}).success,false);assert.equal(quoteBooking.safeParse({...value,duration_minutes:0}).success,false);
});

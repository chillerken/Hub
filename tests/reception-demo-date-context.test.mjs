import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

test('demo provider receives authoritative Brussels date across UTC year boundary',async()=>{
 const instant=Date.parse('2026-12-31T23:30:00Z');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}
 let handler,payload;const tables=[];
 const chain={select(){return this;},eq(){return this;},gte(){return this;},then(resolve){return Promise.resolve({count:0,error:null}).then(resolve);},async insert(){return {error:null};}};
 const source=readFileSync('ai-receptionist-host/supabase/functions/public-demo-chat/index.ts','utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(compiled,{
  exports:{},Request,Response,Headers,Date:Clock,Intl,crypto:webcrypto,TextEncoder,console:{error(){}},
  Deno:{env:{get(k){return ({GEMINI_API_KEY:'isolated-fixture-key',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SECRET_KEYS:'{"default":"fixture-secret"}'})[k];}},serve(h){handler=h;}},
  require(){return {createClient(){return {from(name){tables.push(name);assert.equal(name,'widget_rate_limits','Demo must not write CRM data');return chain;}};}};},
  async fetch(url,options){assert.match(url,/generativelanguage.googleapis.com/);payload=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Alleen een demo-antwoord.'}]}}]}),{status:200});}
 },{timeout:2000});
 const response=await handler(new Request('https://fixture.invalid/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:'garage',message:'Is morgen zaterdag?'})}));
 assert.equal(response.status,200);assert.equal((await response.json()).mode,'live_ai');
 const instructions=payload.system_instruction.parts[0].text;
 assert.match(instructions,/Huidige datum \(Europe\/Brussels\): vrijdag 1 januari 2027/);
 assert.match(instructions,/geen.*live beschikbaarheid/i);
 assert(tables.length>0);
});

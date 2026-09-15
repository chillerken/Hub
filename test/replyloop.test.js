const test=require('node:test');
const assert=require('node:assert/strict');
const makeReplyLoop=require('../src/lead-recovery');

const config={cookieSecret:'x'.repeat(64),baseUrl:'https://example.test',resend:{apiKey:'',from:''}};
const store={listLeads:async()=>[],createLead:async d=>({id:'lead-1',created_at:new Date().toISOString(),...d}),updateLead:async()=>({})};
const fakeDb=async(action,payload)=>{
  if(action==='customer_find')return [];
  if(action==='list')return [];
  if(action==='export_customer')return {customer:{id:payload.id},customer_notes:[]};
  if(action==='save')return payload;
  if(action==='customer_create')return {id:'00000000-0000-4000-8000-000000000001'};
  throw new Error(`unexpected ${action}`);
};
const app=makeReplyLoop(config,store,{db:fakeDb,fetch:async()=>({ok:true,json:async()=>({id:'mail-1'})})});
const t=app._test;

test('ReplyLoop password hashes verify and reject wrong password',()=>{
  const r=t.passwordRecord('very-secure-password');
  assert.equal(t.passwordValid('very-secure-password',{password_salt:r.salt,password_hash:r.hash}),true);
  assert.equal(t.passwordValid('wrong-password',{password_salt:r.salt,password_hash:r.hash}),false);
});

test('ReplyLoop session token is signed and expires',()=>{
  const now=Date.now();
  const token=t.sessionToken(config.cookieSecret,'account-123',now);
  assert.equal(t.verifySession(config.cookieSecret,token,now+1000).sub,'account-123');
  const forged=token.slice(0,-1)+(token.endsWith('a')?'b':'a');
  assert.equal(t.verifySession(config.cookieSecret,forged,now+1000),null);
  assert.equal(t.verifySession(config.cookieSecret,token,now+15*24*3600e3),null);
});

test('ReplyLoop public form keys cannot be forged',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const key=t.publicKey(config.cookieSecret,id);
  assert.equal(t.publicKeyId(config.cookieSecret,key),id);
  assert.equal(t.publicKeyId(config.cookieSecret,key+'x'),null);
});

test('ReplyLoop exposes intended recurring plan limits',()=>{
  assert.equal(t.PLANS.starter.monthly,79);
  assert.equal(t.PLANS.starter.leadLimit,100);
  assert.equal(t.PLANS.growth.monthly,149);
  assert.equal(t.PLANS.growth.followups,4);
});

test('ReplyLoop homepage and CSS routes are server-rendered without provider calls',async()=>{
  const replies=[];
  const res={writeHead:(s,h)=>replies.push({s,h}),end:b=>replies.push({b:String(b)})};
  const helpers={send:(res,status,body,type='text/html',headers={})=>{res.writeHead(status,{'Content-Type':type,...headers});res.end(body);},json(){throw new Error('not used')},redirect(){throw new Error('not used')},sameOrigin:()=>true};
  const handled=await app.routes({method:'GET',url:'/replyloop',headers:{}},res,helpers);
  assert.equal(handled,true);
  assert.match(replies.at(-1).b,/Laat geen warme lead koud worden/);
  assert.match(replies.at(-1).b,/Stripe sandbox actief/);

  replies.length=0;
  await app.routes({method:'GET',url:'/replyloop.css',headers:{}},res,helpers);
  assert.match(replies.at(-1).b,/--accent/);
});

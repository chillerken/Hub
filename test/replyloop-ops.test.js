const test=require('node:test');
const assert=require('node:assert/strict');
const makeOps=require('../src/replyloop-ops');

const config={cookieSecret:'z'.repeat(64),baseUrl:'https://replyloop.test',resend:{apiKey:'',from:''}};
const store={listLeads:async()=>[],getLead:async()=>null,updateLead:async()=>({})};
const fakeDb=async(action)=>{
  if(action==='list')return [];
  if(action==='customer_find')return [];
  if(action==='webhook_claim')return {claimed:true};
  if(action==='webhook_finish')return {ok:true};
  if(action==='member')return null;
  throw new Error(`unexpected ${action}`);
};
const app=makeOps(config,store,{db:fakeDb,fetch:async()=>({ok:true,json:async()=>({})})});

test('ReplyLoop reset tokens verify, expire and reject forgery',()=>{
  const now=Math.floor(Date.now()/1000);
  const token=app._test.resetToken(config.cookieSecret,'account-1','nonce-1',now+3600);
  assert.equal(app._test.readResetToken(config.cookieSecret,token).sub,'account-1');
  const forged=token.slice(0,-1)+(token.endsWith('a')?'b':'a');
  assert.equal(app._test.readResetToken(config.cookieSecret,forged),null);
  const expired=app._test.resetToken(config.cookieSecret,'account-1','nonce-1',now-1);
  assert.equal(app._test.readResetToken(config.cookieSecret,expired),null);
});

test('ReplyLoop ops password hashing produces scrypt record',()=>{
  const r=app._test.passwordRecord('new-secure-password');
  assert.equal(typeof r.password_salt,'string');
  assert.equal(r.password_hash.length,128);
});

test('ReplyLoop enhanced homepage has canonical, Open Graph, useful content and accessible image',async()=>{
  let status=0,body='';
  const res={writeHead:s=>{status=s},end:b=>{body=String(b)}};
  const helpers={send:(res,s,b)=>{status=s;body=String(b)},json(){throw new Error('not used')},redirect(){throw new Error('not used')},sameOrigin:()=>true};
  assert.equal(await app.routes({method:'GET',url:'/replyloop',headers:{}},res,helpers),true);
  assert.equal(status,200);
  assert.match(body,/rel="canonical"/);
  assert.match(body,/property="og:title"/);
  assert.match(body,/replyloop-og\.svg/);
  assert.match(body,/alt="ReplyLoop automatische leadopvolging/);
  assert.ok(body.split(/\s+/).length>600);
});

test('ReplyLoop social image route serves SVG',async()=>{
  let type='',body='';
  const res={};
  const helpers={send:(r,s,b,t)=>{assert.equal(s,200);type=t;body=String(b)},json(){},redirect(){},sameOrigin:()=>true};
  assert.equal(await app.routes({method:'GET',url:'/replyloop-og.svg',headers:{}},res,helpers),true);
  assert.match(type,/svg/);
  assert.match(body,/<svg/);
});

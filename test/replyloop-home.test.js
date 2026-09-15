const test=require('node:test');
const assert=require('node:assert/strict');
const makeHome=require('../src/replyloop-home');

const config={baseUrl:'https://replyloop.test'};
const app=makeHome(config);

test('ReplyLoop public homepage includes SEO fundamentals and deep useful copy',async()=>{
  let status=0,body='',type='';
  const helpers={send:(res,s,b,t)=>{status=s;body=String(b);type=t||'text/html'}};
  assert.equal(await app.routes({method:'GET',url:'/replyloop'}, {}, helpers),true);
  assert.equal(status,200);
  assert.match(body,/rel="canonical" href="https:\/\/replyloop\.test\/replyloop"/);
  assert.match(body,/property="og:title"/);
  assert.match(body,/property="og:image"/);
  assert.match(body,/application\/ld\+json/);
  assert.match(body,/SoftwareApplication/);
  assert.match(body,/FAQPage/);
  assert.match(body,/alt="ReplyLoop automatische leadopvolging/);
  assert.ok(body.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length>600);
  assert.match(type,/html/);
});

test('ReplyLoop OG image is accessible SVG',async()=>{
  let status=0,body='',type='';
  const helpers={send:(res,s,b,t)=>{status=s;body=String(b);type=t}};
  assert.equal(await app.routes({method:'GET',url:'/replyloop-og.svg'}, {}, helpers),true);
  assert.equal(status,200);
  assert.match(type,/svg/);
  assert.match(body,/aria-label="ReplyLoop automatische leadopvolging"/);
});

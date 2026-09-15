const test = require('node:test');
const assert = require('node:assert/strict');

function config() {
  return {
    production:false, baseUrl:'http://localhost:3000', cookieSecret:'x'.repeat(64),
    supabase:{url:'https://example.supabase.co',publishableKey:'anon',appSecret:'s'.repeat(64)},
    resend:{apiKey:'',from:''}
  };
}
function resCapture() {
  return { status:null, headers:null, body:'', writeHead(s,h){this.status=s;this.headers=h;}, end(b=''){this.body+=b;} };
}
const helpers = {
  send(res,status,body,type='text/html; charset=utf-8',extra={}){res.writeHead(status,{'Content-Type':type,...extra});res.end(body);},
  json(res,status,obj,extra={}){this.send(res,status,JSON.stringify(obj),'application/json',extra);},
  redirect(res,to,extra={}){this.send(res,302,'','text/plain',{Location:to,...extra});},
  sameOrigin(){return true;}, isAdmin(){return false;}
};
function freshApp() {
  delete require.cache[require.resolve('../src/autopilot')];
  return require('../src/autopilot')(config());
}

test('public Lead Autopilot pages render without database or fake customer data', async()=>{
  process.env.AUTOPILOT_ENABLED='false';
  const app=freshApp();
  for (const path of ['/autopilot','/autopilot/pricing','/autopilot/free-tool','/autopilot/voor/detailing/aalst']) {
    const req={method:'GET',url:path,headers:{},socket:{remoteAddress:'127.0.0.1'}}; const res=resCapture();
    assert.equal(await app.routes(req,res,helpers),true); assert.equal(res.status,200); assert.match(res.body,/Lead Autopilot/);
  }
});

test('pricing exposes real monthly and annual checkout paths', async()=>{
  process.env.AUTOPILOT_ENABLED='false';
  const app=freshApp();
  const req={method:'GET',url:'/autopilot/pricing',headers:{},socket:{remoteAddress:'127.0.0.1'}}; const res=resCapture();
  await app.routes(req,res,helpers);
  assert.match(res.body,/plan=core_monthly/); assert.match(res.body,/plan=core_annual/);
  assert.match(res.body,/plan=growth_monthly/); assert.match(res.body,/plan=growth_annual/);
});

test('production-only mutations fail closed until backend activation', async()=>{
  process.env.AUTOPILOT_ENABLED='false';
  const app=freshApp();
  const req={method:'POST',url:'/autopilot/signup',headers:{origin:'http://localhost:3000','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from('{"email":"a@example.com","password":"12345678"}');}};
  const res=resCapture(); await app.routes(req,res,helpers); assert.equal(res.status,503); assert.match(res.body,/productie-activatie/i);
});

test('pricing is flat-rate recurring and includes annual option',()=>{
  const stripe=require('../src/autopilot/stripe')(config());
  assert.equal(stripe.PLANS.core_monthly.amount,9900);
  assert.equal(stripe.PLANS.growth_monthly.amount,17900);
  assert.equal(stripe.PLANS.core_annual.interval,'year');
  assert.equal(stripe.PLANS.growth_annual.amount,179000);
});

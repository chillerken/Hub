const crypto = require('node:crypto');
const { booking, contact, intakeDetails } = require('./core/validation');
const { hash } = require('./core/db');

const MAX_CHAT_CHARS = 4000;
const MAX_TOOL_LOOPS = 5;
const GUIDE_URL = 'https://www.luxwash.online';

function makeAppointmentAgent(config) {
  const db = require('./core/db')(config);
  const base = config.supabase.url.replace(/\/$/, '');

  async function stateRpc(action, payload = {}) {
    const r = await fetch(`${base}/rest/v1/rpc/appointment_agent_rpc`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', apikey: config.supabase.publishableKey},
      body: JSON.stringify({p_secret: config.supabase.appSecret, p_action: action, p_payload: payload}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const e = new Error(data?.message || `Appointment state HTTP ${r.status}`);
      e.status = r.status;
      e.code = data?.code;
      throw e;
    }
    return data;
  }

  function allowedOrigin(req) {
    const origin = String(req.headers.origin || '');
    if (!origin) return true;
    return new Set([config.baseUrl, config.publicSiteUrl || 'https://www.luxwash.online']).has(origin);
  }

  function corsHeaders(req) {
    const origin = String(req.headers.origin || '');
    if (!origin || !allowedOrigin(req)) return {};
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
  }

  function sanitizeHistory(history) {
    return (Array.isArray(history) ? history : [])
      .slice(-16)
      .map((x) => `${x.role === 'assistant' ? 'Assistant' : 'Customer'}: ${String(x.content || '').slice(0, 2000)}`)
      .join('\n');
  }

  async function sendEmail(to, subject, text) {
    if (!to || !config.resend.apiKey || !config.resend.from) return {ok:false, reason:'email_unavailable'};
    const r = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{Authorization:`Bearer ${config.resend.apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:config.resend.from,to:[to],subject,text}),
      signal:AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return {ok:false, reason:data?.message || `resend_${r.status}`};
    return {ok:true,id:data?.id || ''};
  }

  function uniqueKey(...parts) {
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0,48);
  }

  function clampDays(v) {
    const n = Number(v || 3);
    return Math.max(1,Math.min(Number.isFinite(n)?Math.floor(n):3,6));
  }

  async function listServices() {
    return {services:await db('catalog')};
  }

  async function businessInfo() {
    const settings = await db('settings');
    return {
      business:settings.business,
      planning:settings.planning,
      website:config.publicSiteUrl || 'https://www.luxwash.online',
      note:'Use only these verified settings. Do not invent availability, prices, service inclusions, or travel coverage.',
    };
  }

  async function getAvailability(args) {
    const days = clampDays(args.days);
    const fromDate = new Date(Date.now()+60*60*1000);
    const toDate = new Date(fromDate.getTime()+days*24*60*60*1000);
    const serviceId = String(args.service_id || '').trim();
    const postcode = String(args.postcode || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(serviceId)) throw new Error('A valid service_id is required. Call list_services first.');
    if (!/^\d{4}$/.test(postcode)) throw new Error('A valid Belgian 4-digit postcode is required.');
    const slots = await db('slots',{service_id:serviceId,postcode,from:fromDate.toISOString(),to:toDate.toISOString()});
    const list = Array.isArray(slots)?slots:Array.isArray(slots?.slots)?slots.slots:[];
    return {slots:list.slice(0,18),from:fromDate.toISOString(),to:toDate.toISOString(),days};
  }

  async function createRequest(args,sessionId) {
    const v = contact.parse({
      name:args.full_name,
      email:args.email || '',
      phone:args.phone || undefined,
      marketing_consent:false,
    });
    const details = intakeDetails.parse({
      address:args.address || undefined,
      postcode:args.postcode || undefined,
      vehicle:args.vehicle || undefined,
      preferred_date:args.preferred_date || undefined,
      area_m2:args.area_m2 || undefined,
      surface_material:args.surface_material || undefined,
    });
    const key = uniqueKey('appointment-agent-request',sessionId,v.email || v.phone || '',args.service || '',args.message || '');
    const row = await db('intake',{
      ...v,
      intake_details:details,
      idempotency_key:key,
      service:String(args.service || '').slice(0,160),
      message:String(args.message || 'Chatbot aanvraag').slice(0,1500),
    });
    return {ok:true,request:row};
  }

  async function bookService(args,sessionId) {
    const candidate = booking.parse({
      name:args.full_name,
      email:args.email || '',
      phone:args.phone || undefined,
      marketing_consent:false,
      service_id:args.service_id,
      category:args.category || 'standard',
      starts_at:args.starts_at,
      postcode:args.postcode,
      address:args.address,
      vehicle:args.vehicle || '',
      notes:args.notes || '',
      confirmed_by_customer:true,
      idempotency_key:uniqueKey('appointment-agent-book',sessionId,args.email || args.phone || '',args.service_id,args.starts_at),
    });
    const manageToken = crypto.createHmac('sha256',config.cookieSecret).update(candidate.idempotency_key).digest('base64url');
    const result = await db('book',{...candidate,source:'appointment_ai',manage_token_hash:hash(manageToken)});
    const appt = result?.appointment || result;
    let emailResult = {ok:false,reason:'no_email'};
    if (candidate.email && appt?.starts_at) {
      const when = new Date(appt.starts_at).toLocaleString('nl-BE',{timeZone:'Europe/Brussels',dateStyle:'full',timeStyle:'short'});
      emailResult = await sendEmail(
        candidate.email,
        'LuxWash afspraak bevestigd',
        `Dag ${candidate.name},\n\nJe LuxWash-afspraak is ingepland voor ${when}.\n\nAdres: ${candidate.address}\nPostcode: ${candidate.postcode}\n\nHeb je nog een vraag? Antwoord op deze e-mail of neem contact op via ${config.business.phone || 'www.luxwash.online'}.\n\nLuxWash`
      );
    }
    return {ok:true,booking:appt,confirmation_email_queued_or_sent:Boolean(emailResult.ok),manage_token:manageToken};
  }

  const tools = [
    {type:'function',name:'get_business_info',description:'Get verified LuxWash business and planning information. Use before answering factual questions about area, hours, or planning rules.',parameters:{type:'object',properties:{},additionalProperties:false}},
    {type:'function',name:'list_services',description:'Get the current LuxWash service catalog, including service IDs and verified pricing/service data.',parameters:{type:'object',properties:{},additionalProperties:false}},
    {type:'function',name:'get_availability',description:'Get real available LuxWash appointment slots. Always call this before offering times. Maximum six days.',parameters:{type:'object',properties:{service_id:{type:'string'},postcode:{type:'string'},days:{type:'integer',minimum:1,maximum:6}},required:['service_id','postcode'],additionalProperties:false}},
    {type:'function',name:'create_request',description:'Create a LuxWash customer request when the customer wants follow-up but is not ready to select a real slot.',parameters:{type:'object',properties:{full_name:{type:'string'},email:{type:'string'},phone:{type:'string'},service:{type:'string'},message:{type:'string'},address:{type:'string'},postcode:{type:'string'},vehicle:{type:'string'},preferred_date:{type:'string'},area_m2:{type:'number'},surface_material:{type:'string'}},required:['full_name','message'],additionalProperties:false}},
    {type:'function',name:'book_service',description:'Create the actual LuxWash booking. Use only after the customer explicitly chose a slot returned by get_availability and all required contact/address fields are known.',parameters:{type:'object',properties:{full_name:{type:'string'},email:{type:'string'},phone:{type:'string'},service_id:{type:'string'},category:{type:'string'},starts_at:{type:'string'},postcode:{type:'string'},address:{type:'string'},vehicle:{type:'string'},notes:{type:'string'}},required:['full_name','service_id','starts_at','postcode','address'],additionalProperties:false}},
  ];

  const instructions = `You are the booking and customer intake assistant for LuxWash, a mobile cleaning service in Belgium.

GOAL
Help customers choose a real LuxWash service, answer factual questions with verified tool data, create a request, or book a real appointment.

STYLE
- Reply in the customer's language. Default to clear Belgian Dutch.
- Short, helpful, professional sentences.
- One question at a time unless several details are logically needed together for a booking.
- Never pressure the customer.

ACCURACY
- Never invent prices, inclusions, areas, opening hours, discounts or availability.
- Use list_services for current services and price information.
- Use get_business_info for business/planning facts.
- Use get_availability before showing appointment times.
- Show at most 3 useful slots at a time.
- If a tool fails, say live data cannot be retrieved and direct the customer to https://www.luxwash.online.

BOOKING
- If the customer wants to book, prioritize booking immediately.
- Needed before availability: exact service and postcode.
- Needed before final booking: full name, email or phone, exact service_id, selected starts_at, postcode and street address. Vehicle information is useful for car services.
- Only call book_service after the customer explicitly selected a slot actually returned by get_availability.
- Do not ask again for information already present in conversation history.
- After a successful booking, say the appointment was created. Mention confirmation email only when the tool says it was sent/queued.

LEADS
- If the customer wants personal follow-up instead of booking, use create_request once you have name plus at least email or phone.
- Do not put sensitive or unnecessary personal data in the request.

PRIVACY
- Ask only for details necessary to answer, quote or book.
- Never reveal another customer's data.

MANUAL FALLBACK
Website: https://www.luxwash.online
If live availability or booking cannot be completed, direct the customer there or to the verified phone/email returned by get_business_info.`;

  async function executeTool(name,args,sessionId) {
    switch(name) {
      case 'get_business_info': return businessInfo();
      case 'list_services': return listServices();
      case 'get_availability': return getAvailability(args || {});
      case 'create_request': return createRequest(args || {},sessionId);
      case 'book_service': return bookService(args || {},sessionId);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  }

  async function openai(payload) {
    const r = await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${config.openaiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(45000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data?.error?.message || `OpenAI HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return data;
  }

  function outputText(response) {
    if (response?.output_text) return String(response.output_text).trim();
    return (response?.output || []).flatMap(o=>o.content || []).filter(c=>c.type==='output_text').map(c=>c.text).join('\n').trim();
  }

  async function answer(message,sessionId) {
    if (config.aiMode !== 'generative' || !config.openaiKey) {
      const e = new Error('AI-assistent is nog niet geconfigureerd.');
      e.status = 503;
      throw e;
    }
    const session = await stateRpc('session_get',{session_id:sessionId});
    const history = sanitizeHistory(session?.history || []);
    await stateRpc('message_add',{session_id:sessionId,role:'user',content:message});

    let response = await openai({
      model:config.openaiModel,
      instructions,
      input:`${history ? `Conversation history:\n${history}\n\n` : ''}Customer: ${message}`,
      tools,
      parallel_tool_calls:false,
      max_output_tokens:650,
      reasoning:{effort:'low'},
    });

    for (let loop=0;loop<MAX_TOOL_LOOPS;loop+=1) {
      const calls = (response.output || []).filter(o=>o.type==='function_call');
      if (!calls.length) break;
      const outputs = [];
      for (const call of calls) {
        let result;
        try {
          const args = call.arguments ? JSON.parse(call.arguments) : {};
          result = await executeTool(call.name,args,sessionId);
        } catch(e) {
          result = {ok:false,error:e.message || 'tool_failed'};
        }
        outputs.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)});
      }
      response = await openai({
        model:config.openaiModel,
        previous_response_id:response.id,
        input:outputs,
        tools,
        parallel_tool_calls:false,
        max_output_tokens:650,
        reasoning:{effort:'low'},
      });
    }

    const text = outputText(response) || 'Ik kan dit nu niet betrouwbaar afronden. Gebruik https://www.luxwash.online voor de actuele opties.';
    await stateRpc('message_add',{session_id:sessionId,role:'assistant',content:text});
    return {answer:text,session_token:sessionId,mode:'appointment_ai'};
  }

  async function routes(req,res,helpers) {
    const {json,body,rateOk} = helpers;
    const u = new URL(req.url,config.baseUrl);
    const p = u.pathname;
    if (!['/api/chat','/api/appointment-agent/chat','/api/appointment-agent/status'].includes(p)) return false;

    if (req.method === 'OPTIONS') {
      res.writeHead(204,corsHeaders(req));
      res.end();
      return true;
    }
    if (!allowedOrigin(req)) {
      json(res,403,{error:'Ongeldige oorsprong'});
      return true;
    }
    if (req.method === 'GET' && p === '/api/appointment-agent/status') {
      try {
        const dbHealth = await stateRpc('health');
        json(res,200,{ok:Boolean(dbHealth?.ok),ai:config.aiMode==='generative'&&Boolean(config.openaiKey),email:Boolean(config.resend.apiKey&&config.resend.from)},corsHeaders(req));
      } catch {
        json(res,503,{ok:false},corsHeaders(req));
      }
      return true;
    }
    if (req.method !== 'POST') return false;
    if (!rateOk(req,'appointment-agent',30,60000)) {
      json(res,429,{error:'Te veel berichten. Probeer zo meteen opnieuw.'},corsHeaders(req));
      return true;
    }
    const b = await body(req);
    const message = String(b.message || b.chatInput || '').trim().slice(0,MAX_CHAT_CHARS);
    if (!message) {
      json(res,400,{error:'Bericht ontbreekt'},corsHeaders(req));
      return true;
    }
    const sessionId = String(b.session_token || b.sessionId || crypto.randomBytes(32).toString('base64url')).slice(0,160);
    try {
      json(res,200,await answer(message,sessionId),corsHeaders(req));
    } catch(e) {
      console.error('Appointment agent error:',e.message);
      json(res,e.status&&e.status>=400&&e.status<600?e.status:502,{error:'De afspraakassistent is tijdelijk niet bereikbaar.',fallback_url:GUIDE_URL},corsHeaders(req));
    }
    return true;
  }

  async function runAutomation() {
    try { await stateRpc('cleanup'); return {ok:true}; }
    catch(e) { console.error('Appointment agent cleanup failed:',e.message); return {ok:false,error:e.message}; }
  }

  return {routes,runAutomation,ready:config.aiMode==='generative'&&Boolean(config.openaiKey)};
}

module.exports = makeAppointmentAgent;

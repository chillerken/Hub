import asyncio,json,os,logging,re,hashlib
from contextlib import asynccontextmanager
import requests,websockets
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import JSONResponse
from openai import OpenAI,InvalidWebhookSignatureError
import central
logging.basicConfig(level=logging.INFO)
log=logging.getLogger('astra')
KEY=os.getenv('OPENAI_API_KEY','')
SECRET=os.getenv('OPENAI_WEBHOOK_SECRET','')
MODEL=os.getenv('OPENAI_REALTIME_MODEL','gpt-realtime-2.1')
VOICE=os.getenv('OPENAI_REALTIME_VOICE','marin')
client=OpenAI(api_key=KEY,webhook_secret=SECRET) if KEY and SECRET else None
tasks=set()
def transcript_event_id(call_id,event):
    if event.get('event_id'):return event['event_id']
    if event.get('item_id'):return event['item_id']+':'+event['type']
    # Deterministic fallback without storing transcript text in identifiers.
    return call_id+':'+hashlib.sha256(json.dumps(event,sort_keys=True).encode()).hexdigest()
async def bootstrap_bridge(application,attempts=1):
    for attempt in range(attempts):
        try:
            settings=await asyncio.to_thread(central.bootstrap)
            if not isinstance(settings,dict) or not settings.get('tools') or not settings.get('instructions'):
                raise central.BridgeError('invalid_bootstrap')
            application.state.bridge_ready=True
            application.state.bridge_error=''
            application.state.phone_policy_version=settings.get('policy_version','legacy')
            application.state.assistant_name=settings.get('assistant_name','Astra')
            log.info('CRM bridge ready: tools=%s',len(settings['tools']))
            return settings
        except Exception as exc:
            code=exc.code if isinstance(exc,central.BridgeError) else 'unexpected_error'
            application.state.bridge_ready=False
            application.state.bridge_error=code
            log.warning('CRM bridge unavailable: code=%s attempt=%s',code,attempt+1)
            if not isinstance(exc,central.BridgeError) or not exc.retryable or attempt+1>=attempts:raise
            await asyncio.sleep(2*(attempt+1))
@asynccontextmanager
async def lifespan(app):
    try:
        await bootstrap_bridge(app,attempts=3)
    except Exception:
        app.state.bridge_ready=False
    try:
        response=await asyncio.to_thread(requests.get,'https://api.openai.com/v1/models/'+MODEL,headers={'Authorization':'Bearer '+KEY},timeout=10)
        model_status=response.status_code
        error=(response.json().get('error') or {}) if not response.ok else {}
        model_error=error.get('code') or error.get('type') or ''
        if not re.fullmatch(r'[a-zA-Z0-9_]{0,80}',str(model_error)):model_error='unclassified'
    except Exception:model_status='timeout';model_error='unavailable'
    app.state.model_status=model_status
    app.state.model_error=model_error
    log.info('Astra configuration: openai=%s webhook=%s central_bridge=%s model_status=%s model_error=%s recording=false',bool(KEY),bool(SECRET),app.state.bridge_ready,model_status,model_error)
    yield
    for t in tuple(tasks): t.cancel()
    if tasks: await asyncio.gather(*tasks,return_exceptions=True)
app=FastAPI(title='LuxWash Astra',version='3.0.0',lifespan=lifespan)
@app.get('/health')
def health():
    required={'OPENAI_API_KEY':bool(KEY),'OPENAI_WEBHOOK_SECRET':bool(SECRET),'SUPABASE_APP_SECRET':bool(central.SECRET)}
    return {'ok':all(required.values()) and getattr(app.state,'bridge_ready',False) and getattr(app.state,'model_status',None)==200,'assistant_name':getattr(app.state,'assistant_name','Astra'),'phone_policy_version':getattr(app.state,'phone_policy_version',None),'call_log_format':'luxwash-crm-v1','central_bridge':getattr(app.state,'bridge_ready',False),'bridge_error':getattr(app.state,'bridge_error',None),'required':required,'recording':False,'live_call_verified':False,'model_status':getattr(app.state,'model_status',None),'model_error':getattr(app.state,'model_error',None),'provider':'SIP via OpenAI','route_verified':False,'active_calls':len(tasks)}
async def db(action,payload): return await asyncio.to_thread(central.event,action,payload)
def accept(call_id,settings):
    tools=[{k:v for k,v in t.items() if k!='strict'} for t in settings['tools']]
    config={'type':'realtime','model':MODEL,'instructions':settings['instructions'],'tools':tools,'tool_choice':'auto','audio':{'input':{'transcription':{'model':'gpt-4o-mini-transcribe','language':'nl'}},'output':{'voice':VOICE}}}
    r=requests.post('https://api.openai.com/v1/realtime/calls/'+call_id+'/accept',headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},json=config,timeout=20);r.raise_for_status()
async def handle_tool(ws,call_id,crm_id,event):
    tool_call_id=event.get('call_id');name=event.get('name')
    if not tool_call_id or not name:return
    claim=await db('tool_claim',{'provider_call_id':call_id,'tool_call_id':tool_call_id,'name':name})
    if not claim or not claim['claimed']:
        previous=(claim or {}).get('action') or {}
        result=previous.get('result') or {'ok':False,'error':'Actie is al in behandeling. Niet herhalen.'}
    else:
        try:
            args=json.loads(event.get('arguments') or '{}')
            result=await asyncio.to_thread(central.tool,name,args,{'sessionId':call_id,'toolCallId':tool_call_id,'phoneCallId':crm_id})
            if name=='createAppointment' and result.get('ok'):
                await db('call_update',{'provider_call_id':call_id,'intent':'booking'})
        except Exception:
            log.warning('Tool failed: %s',name)
            result={'ok':False,'error':'Ik krijg de actie niet definitief opgeslagen. Vraag contactgegevens en maak een terugbelactie.'}
            try: await db('handoff',{'phone_call_id':crm_id,'summary':'Technische fout tijdens '+name,'priority':'high'})
            except Exception: log.error('Callback persistence unavailable; provider call log requires manual review')
        await db('tool_finish',{'tool_call_id':tool_call_id,'result':result})
    await ws.send(json.dumps({'type':'conversation.item.create','item':{'type':'function_call_output','call_id':tool_call_id,'output':json.dumps(result,ensure_ascii=False)}}))
    await ws.send(json.dumps({'type':'response.create'}))
async def conversation(call_id,crm_id,settings):
    failed=False
    transcript=[]
    try:
        async with websockets.connect('wss://api.openai.com/v1/realtime?call_id='+call_id,additional_headers={'Authorization':'Bearer '+KEY},max_size=4000000) as ws:
            await db('call_update',{'provider_call_id':call_id,'status':'connected'})
            greeting=settings.get('greeting') or 'Goeiedag, u spreekt met Astra, de digitale telefoonassistente van LuxWash; dit gesprek wordt naar tekst omgezet voor uw aanvraag, zonder audio-opname te bewaren. Waarmee kan ik u helpen?'
            await ws.send(json.dumps({'type':'response.create','response':{'instructions':'Zeg uitsluitend deze begroeting, in twee korte zinnen: '+greeting}}))
            async for raw in ws:
                e=json.loads(raw);et=e.get('type')
                # Consume one canonical tool event only; persistent claim also protects reconnects/retries.
                if et=='response.function_call_arguments.done':await handle_tool(ws,call_id,crm_id,e)
                elif et in ('conversation.item.input_audio_transcription.completed','response.output_audio_transcript.done'):
                    text=e.get('transcript','')
                    if text:
                        turn={'role':'customer' if et.startswith('conversation') else 'assistant','content':text[:12000]}
                        transcript.append(turn)
                        while len(transcript)>200 or sum(len(t['content']) for t in transcript)>24000:transcript.pop(0)
                        try:await db('transcript',{'provider_call_id':call_id,'event_id':transcript_event_id(call_id,e),**turn})
                        except Exception:log.warning('Transcript journal unavailable; final CRM log will retry the available conversation')
                elif et=='error':
                    code=(e.get('error') or {}).get('code','unknown')
                    safe_code=code if code in ('insufficient_quota','rate_limit_exceeded','server_error','invalid_api_key','conversation_already_has_active_response') else 'unclassified'
                    log.warning('Realtime reported error %s',safe_code)
                    if code in ('insufficient_quota','invalid_api_key','server_error'):
                        failed=True
                        break
                elif et=='session.closed':break
    except asyncio.CancelledError:
        failed=True;raise
    except Exception:
        failed=True;log.warning('Realtime connection interrupted')
    finally:
        await finalize_call(call_id,crm_id,transcript,failed)

async def finalize_call(call_id,crm_id,turns,failed):
    # Save a JSON log even after an immediate hang-up. The CRM does not call an AI provider.
    saved=False
    for attempt in range(2):
        try:
            result=await asyncio.to_thread(central.post,'summary',{'provider_call_id':call_id,'turns':turns,'failed':failed})
            if not result.get('saved'):raise central.BridgeError('log_not_confirmed')
            saved=True;break
        except Exception:
            log.warning('Final CRM log unavailable: attempt=%s',attempt+1)
            if attempt==0:await asyncio.sleep(1)
    if not saved:
        try:await db('call_update',{'provider_call_id':call_id,'status':'failed','escalated':True})
        except Exception:log.error('Call persistence unavailable; check provider logs')
    if failed or not saved:
        try:await db('handoff',{'phone_call_id':crm_id,'summary':'Telefoongesprek onderbroken of gesprekslog niet bevestigd. Controleer transcript en telefoonlog.','priority':'high'})
        except Exception:log.error('Callback persistence unavailable; check provider logs')
@app.post('/openai/realtime-webhook')
async def webhook(request:Request):
    if not client:raise HTTPException(503,'Voice credentials ontbreken')
    chunks=[];size=0
    async for chunk in request.stream():
        size+=len(chunk)
        if size>100000:raise HTTPException(413,'Request too large')
        chunks.append(chunk)
    raw=b''.join(chunks)
    try:event=client.webhooks.unwrap(raw,request.headers)
    except InvalidWebhookSignatureError:raise HTTPException(400,'Invalid signature')
    except Exception:raise HTTPException(400,'Invalid webhook')
    if event.type!='realtime.call.incoming':return {'ok':True}
    call_id=event.data.call_id
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,180}',call_id):raise HTTPException(400,'Invalid call id')
    accepted=False
    try:
        claim=await db('webhook_claim',{'id':event.id,'provider':'openai'})
        if not claim.get('claimed'):
            if claim.get('completed'):return {'ok':True,'duplicate':True}
            return JSONResponse(status_code=503,content={'error':'Event still processing; retry'})
        headers=event.data.sip_headers or []
        from_header=next((getattr(h,'value','') if not isinstance(h,dict) else h.get('value','') for h in headers if (getattr(h,'name','') if not isinstance(h,dict) else h.get('name','')).lower()=='from'),'')
        match=re.search(r'\+[1-9][0-9]{7,14}',from_header)
        call=await db('call_start',{'provider_call_id':call_id,'phone':match.group(0) if match else None})
        if call.get('status') in ('accepted','connected','completed'):
            await db('webhook_finish',{'id':event.id})
            return {'ok':True,'duplicate':True}
        settings=await bootstrap_bridge(app)
        await asyncio.to_thread(accept,call_id,settings)
        accepted=True
        task=asyncio.create_task(conversation(call_id,call['id'],settings));tasks.add(task);task.add_done_callback(tasks.discard)
        await db('webhook_finish',{'id':event.id})
        return {'ok':True}
    except Exception:
        if accepted:
            # The call is already active. A journal outage must not reject it or accept twice.
            log.warning('Call accepted; webhook acknowledgement journal needs review')
            return {'ok':True,'journal_pending':True}
        log.warning('Unable to accept incoming call')
        try:
            await db('call_update',{'provider_call_id':call_id,'status':'failed','escalated':True})
            await db('handoff',{'summary':'Astra kon een inkomende oproep niet aannemen; controleer telefoonlog.','priority':'high'})
        except Exception:pass
        raise HTTPException(503,'Unable to accept call')

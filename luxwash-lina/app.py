import asyncio,json,os,logging,re
from contextlib import asynccontextmanager
import requests,websockets
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import JSONResponse
from openai import OpenAI,InvalidWebhookSignatureError
import central
logging.basicConfig(level=logging.INFO)
log=logging.getLogger('lina')
KEY=os.getenv('OPENAI_API_KEY','')
SECRET=os.getenv('OPENAI_WEBHOOK_SECRET','')
MODEL=os.getenv('OPENAI_REALTIME_MODEL','gpt-realtime-2.1')
VOICE=os.getenv('OPENAI_REALTIME_VOICE','marin')
client=OpenAI(api_key=KEY,webhook_secret=SECRET) if KEY and SECRET else None
tasks=set()
@asynccontextmanager
async def lifespan(app):
    try:
        settings=await asyncio.to_thread(central.bootstrap)
        app.state.bridge_ready=bool(settings.get('tools'))
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
    log.info('Lina configuration: openai=%s webhook=%s central_bridge=%s model_status=%s model_error=%s recording=false',bool(KEY),bool(SECRET),app.state.bridge_ready,model_status,model_error)
    yield
    for t in tuple(tasks): t.cancel()
    if tasks: await asyncio.gather(*tasks,return_exceptions=True)
app=FastAPI(title='LuxWash Lina',version='2.0.0',lifespan=lifespan)
@app.get('/health')
def health():
    required={'OPENAI_API_KEY':bool(KEY),'OPENAI_WEBHOOK_SECRET':bool(SECRET),'SUPABASE_APP_SECRET':bool(central.SECRET)}
    return {'ok':all(required.values()) and getattr(app.state,'bridge_ready',False),'central_bridge':getattr(app.state,'bridge_ready',False),'required':required,'recording':False,'live_call_verified':False,'model_status':getattr(app.state,'model_status',None),'model_error':getattr(app.state,'model_error',None),'provider':'SIP via OpenAI','route_verified':False,'active_calls':len(tasks)}
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
            await ws.send(json.dumps({'type':'response.create','response':{'instructions':'Begroet de beller als Lina, digitale assistente van LuxWash. Meld kort: uw gesprek wordt omgezet naar tekst om uw aanvraag te behandelen; er wordt geen audio-opname bewaard. Vraag waarmee u kan helpen.'}}))
            async for raw in ws:
                e=json.loads(raw);et=e.get('type')
                # Consume one canonical tool event only; persistent claim also protects reconnects/retries.
                if et=='response.function_call_arguments.done':await handle_tool(ws,call_id,crm_id,e)
                elif et in ('conversation.item.input_audio_transcription.completed','response.output_audio_transcript.done'):
                    text=e.get('transcript','')
                    if text:
                        transcript.append(text[:12000])
                        await db('transcript',{'provider_call_id':call_id,'event_id':e.get('event_id') or e.get('item_id')+':'+et,'role':'customer' if et.startswith('conversation') else 'assistant','content':text[:12000]})
                elif et=='error':
                    log.warning('Realtime reported error %s',(e.get('error') or {}).get('code','unknown'))
                elif et=='session.closed':break
    except asyncio.CancelledError:
        failed=True;raise
    except Exception:
        failed=True;log.warning('Realtime connection interrupted')
    finally:
        try:
            await db('call_update',{'provider_call_id':call_id,'status':'failed' if failed else 'completed','escalated':failed})
            if transcript:
                try:await asyncio.to_thread(central.post,'summary',{'provider_call_id':call_id,'transcript':'\n'.join(transcript)[-24000:]})
                except Exception:log.warning('Summary unavailable; original transcript retained')
            if failed:await db('handoff',{'phone_call_id':crm_id,'summary':'Telefoongesprek onderbroken. Controleer transcript en bel terug.','priority':'high'})
        except Exception:log.error('Call persistence unavailable; check provider logs')
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
    try:
        claim=await db('webhook_claim',{'id':event.id,'provider':'openai'})
        if not claim.get('claimed'):
            if claim.get('completed'):return {'ok':True,'duplicate':True}
            return JSONResponse(status_code=503,content={'error':'Event still processing; retry'})
        headers=event.data.sip_headers or []
        from_header=next((getattr(h,'value','') if not isinstance(h,dict) else h.get('value','') for h in headers if (getattr(h,'name','') if not isinstance(h,dict) else h.get('name','')).lower()=='from'),'')
        match=re.search(r'\+[1-9][0-9]{7,14}',from_header)
        call=await db('call_start',{'provider_call_id':call_id,'phone':match.group(0) if match else None})
        settings=await asyncio.to_thread(central.bootstrap)
        await asyncio.to_thread(accept,call_id,settings)
        task=asyncio.create_task(conversation(call_id,call['id'],settings));tasks.add(task);task.add_done_callback(tasks.discard)
        await db('webhook_finish',{'id':event.id})
        return {'ok':True}
    except Exception:
        log.warning('Unable to accept incoming call')
        try:
            await db('call_update',{'provider_call_id':call_id,'status':'failed','escalated':True})
            await db('handoff',{'summary':'Lina kon een inkomende oproep niet aannemen; controleer telefoonlog.','priority':'high'})
        except Exception:pass
        raise HTTPException(503,'Unable to accept call')

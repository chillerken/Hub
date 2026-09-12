import asyncio, json, os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
os.environ.setdefault('OPENAI_API_KEY','sk-test-only-not-a-credential')
os.environ.setdefault('OPENAI_WEBHOOK_SECRET','whsec_dGVzdA==')
import app
class Socket:
    def __init__(self):self.sent=[]
    async def send(self,value):self.sent.append(json.loads(value))
def test_one_tool_execution_for_duplicate_event(monkeypatch):
    calls=[];claimed=False
    async def db(action,payload):
        nonlocal claimed
        if action=='tool_claim':
            prior=claimed;claimed=True
            return {'claimed':not prior,'action':{'result':{'ok':True}}}
        return {'ok':True}
    def tool(name,args,context):calls.append(name);return {'ok':True}
    monkeypatch.setattr(app,'db',db);monkeypatch.setattr(app.central,'tool',tool)
    event={'call_id':'tool-1','name':'getServices','arguments':'{}'};ws=Socket()
    asyncio.run(app.handle_tool(ws,'call-1','crm-1',event));asyncio.run(app.handle_tool(ws,'call-1','crm-1',event))
    assert calls==['getServices']
def test_failed_tool_creates_callback_and_does_not_confirm(monkeypatch):
    events=[]
    async def db(action,payload):events.append(action);return {'claimed':True}
    def tool(*args):raise RuntimeError('failure')
    monkeypatch.setattr(app,'db',db);monkeypatch.setattr(app.central,'tool',tool)
    ws=Socket();asyncio.run(app.handle_tool(ws,'call-1','crm-1',{'call_id':'tool-1','name':'createAppointment','arguments':'{}'}))
    assert 'handoff' in events
    assert json.loads(ws.sent[0]['item']['output'])['ok'] is False
def test_invalid_webhook_signature(monkeypatch):
    from fastapi.testclient import TestClient
    client=TestClient(app.app)
    response=client.post('/openai/realtime-webhook',content='{}',headers={'webhook-signature':'invalid'})
    assert response.status_code==400
def test_no_recording_or_unverified_live_claim():
    status=app.health();assert status['recording'] is False;assert status['live_call_verified'] is False

def test_processing_webhook_requests_retry_without_failing_original_call(monkeypatch):
    from types import SimpleNamespace
    from fastapi.testclient import TestClient
    event=SimpleNamespace(type='realtime.call.incoming',id='event-qa',data=SimpleNamespace(call_id='call-qa'))
    monkeypatch.setattr(app,'client',SimpleNamespace(webhooks=SimpleNamespace(unwrap=lambda *args:event)))
    actions=[]
    async def db(action,payload):actions.append(action);return {'claimed':False,'completed':False}
    monkeypatch.setattr(app,'db',db)
    response=TestClient(app.app).post('/openai/realtime-webhook',content='{}')
    assert response.status_code==503
    assert actions==['webhook_claim']

def test_completed_webhook_replay_is_acknowledged(monkeypatch):
    from types import SimpleNamespace
    from fastapi.testclient import TestClient
    event=SimpleNamespace(type='realtime.call.incoming',id='event-qa',data=SimpleNamespace(call_id='call-qa'))
    monkeypatch.setattr(app,'client',SimpleNamespace(webhooks=SimpleNamespace(unwrap=lambda *args:event)))
    async def db(action,payload):return {'claimed':False,'completed':True}
    monkeypatch.setattr(app,'db',db)
    response=TestClient(app.app).post('/openai/realtime-webhook',content='{}')
    assert response.status_code==200

def test_invalid_live_key_cannot_report_ready(monkeypatch):
    monkeypatch.setattr(app,'KEY','test-only')
    monkeypatch.setattr(app,'SECRET','test-only')
    monkeypatch.setattr(app.central,'SECRET','test-only')
    monkeypatch.setattr(app.app.state,'bridge_ready',True,raising=False)
    monkeypatch.setattr(app.app.state,'model_error','invalid_api_key',raising=False)
    assert app.health()['ok'] is False

def test_bridge_auth_failure_is_sanitized_and_not_retried(monkeypatch,caplog):
    from types import SimpleNamespace
    import pytest
    calls=[]
    monkeypatch.setattr(app.central,'SECRET','test-secret')
    def post(*args,**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status_code=401,text='sensitive response must never be logged')
    monkeypatch.setattr(app.central.requests,'post',post)
    application=SimpleNamespace(state=SimpleNamespace())
    with pytest.raises(app.central.BridgeError,match='http_401'):
        asyncio.run(app.bootstrap_bridge(application,attempts=3))
    assert len(calls)==1
    assert calls[0]['allow_redirects'] is False
    assert application.state.bridge_ready is False
    assert application.state.bridge_error=='http_401'
    assert 'sensitive response' not in caplog.text
    assert 'test-secret' not in caplog.text

def test_bootstrap_recovers_after_transient_failure(monkeypatch):
    from types import SimpleNamespace
    attempts=[]
    def bootstrap():
        attempts.append(1)
        if len(attempts)==1:raise app.central.BridgeError('http_503',True)
        return {'tools':[{'name':'getServices'}],'instructions':'Test only'}
    async def no_delay(*args):pass
    monkeypatch.setattr(app.central,'bootstrap',bootstrap)
    monkeypatch.setattr(app.asyncio,'sleep',no_delay)
    application=SimpleNamespace(state=SimpleNamespace(bridge_ready=False))
    asyncio.run(app.bootstrap_bridge(application,attempts=3))
    assert len(attempts)==2
    assert application.state.bridge_ready is True
    assert application.state.bridge_error==''

def test_mutations_are_never_automatically_retried(monkeypatch):
    import pytest,requests
    calls=[]
    monkeypatch.setattr(app.central,'SECRET','test-secret')
    def post(*args,**kwargs):
        calls.append(1)
        raise requests.Timeout('secret URL must not be exposed')
    monkeypatch.setattr(app.central.requests,'post',post)
    with pytest.raises(app.central.BridgeError,match='^timeout$'):
        app.central.event('call_start',{})
    assert len(calls)==1

def test_model_timeout_cannot_report_ready(monkeypatch):
    monkeypatch.setattr(app,'KEY','test-only')
    monkeypatch.setattr(app,'SECRET','test-only')
    monkeypatch.setattr(app.central,'SECRET','test-only')
    monkeypatch.setattr(app.app.state,'bridge_ready',True,raising=False)
    monkeypatch.setattr(app.app.state,'model_status','timeout',raising=False)
    assert app.health()['ok'] is False

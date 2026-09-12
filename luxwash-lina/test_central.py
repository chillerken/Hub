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

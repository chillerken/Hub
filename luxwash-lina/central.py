"""Authenticated bridge to the single LuxWash CRM/tool runtime. No local CRM state."""
import os,json,time,hmac,hashlib,requests
BASE=os.getenv('CENTRAL_API_URL','https://ai-business-automation-production-gj.onrender.com').rstrip('/')
SECRET=os.getenv('SUPABASE_APP_SECRET','')
class BridgeError(RuntimeError):
    """Only fixed diagnostic codes; never include URLs, headers or response bodies."""
    def __init__(self,code,retryable=False):
        super().__init__(code)
        self.code=code
        self.retryable=retryable
def post(path,payload):
    if not SECRET: raise BridgeError('missing_app_secret')
    raw=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
    timestamp=str(int(time.time()))
    signature=hmac.new(SECRET.encode(),timestamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    try:
        r=requests.post(BASE+'/api/lina/'+path,data=raw,headers={'Content-Type':'application/json','X-Luxwash-Timestamp':timestamp,'X-Luxwash-Signature':signature},timeout=25,allow_redirects=False)
    except requests.Timeout:raise BridgeError('timeout',True) from None
    except requests.RequestException:raise BridgeError('network_error',True) from None
    if not 200<=r.status_code<300:
        raise BridgeError('http_'+str(r.status_code),r.status_code in (408,429,502,503,504))
    try:return r.json()
    except ValueError:raise BridgeError('invalid_response') from None
def event(action,payload): return post('event',{'action':action,'payload':payload})
def bootstrap(): return post('bootstrap',{})
def tool(name,arguments,context): return post('tool',{'name':name,'arguments':arguments,'context':context})

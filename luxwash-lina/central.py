"""Authenticated bridge to the single LuxWash CRM/tool runtime. No local CRM state."""
import os,json,time,hmac,hashlib,requests
BASE=os.getenv('CENTRAL_API_URL','https://ai-business-automation-production-gj.onrender.com').rstrip('/')
SECRET=os.getenv('SUPABASE_APP_SECRET','')
def post(path,payload):
    if not SECRET: raise RuntimeError('SUPABASE_APP_SECRET ontbreekt')
    raw=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
    timestamp=str(int(time.time()))
    signature=hmac.new(SECRET.encode(),timestamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
    r=requests.post(BASE+'/api/lina/'+path,data=raw,headers={'Content-Type':'application/json','X-Luxwash-Timestamp':timestamp,'X-Luxwash-Signature':signature},timeout=25)
    r.raise_for_status()
    return r.json()
def event(action,payload): return post('event',{'action':action,'payload':payload})
def bootstrap(): return post('bootstrap',{})
def tool(name,arguments,context): return post('tool',{'name':name,'arguments':arguments,'context':context})

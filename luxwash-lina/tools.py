import os, json, base64, sqlite3, re
from datetime import datetime, timedelta, time
from email.message import EmailMessage
from zoneinfo import ZoneInfo
from typing import Dict, Any
import requests

TZ = ZoneInfo("Europe/Brussels")
DB = os.getenv("AUDIT_DB","/tmp/luxwash_lina.sqlite3")
CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID","primary")
TRANSFER_NUMBER = "+32468186477"
INTERNAL_EMAIL = "info@luxwash.online"

def fn(name, description, properties, required):
    return {"type":"function","name":name,"description":description,"parameters":{"type":"object","properties":properties,"required":required,"additionalProperties":False}}

TOOL_DEFS = [
    fn("check_calendar","Zoek maximaal drie vrije voorlopige opties in Europe/Brussels, alleen tussen 08:00 en 20:00.",{"date":{"type":"string"},"window_start":{"type":"string"},"window_end":{"type":"string"},"duration_minutes":{"type":"integer","minimum":30,"maximum":480},"timezone":{"type":"string","enum":["Europe/Brussels"]}},["date","window_start","window_end","duration_minutes","timezone"]),
    fn("mark_summary_confirmed","Markeer mondelinge bevestiging van de samenvatting.",{"confirmed":{"type":"boolean"}},["confirmed"]),
    fn("mark_data_transfer_consent","Markeer expliciete toestemming voor gegevensoverdracht.",{"consent":{"type":"boolean"}},["consent"]),
    fn("mark_whatsapp_consent","Markeer aparte expliciete toestemming voor WhatsApp.",{"consent":{"type":"boolean"}},["consent"]),
    fn("create_tentative_request","Maak voorlopig Google-agendablok, alleen na bevestiging en toestemming.",{"name":{"type":"string"},"phone":{"type":"string"},"address":{"type":"string"},"municipality":{"type":"string"},"service":{"type":"string"},"scope":{"type":"string"},"start_time":{"type":"string"},"end_time":{"type":"string"},"photo_status":{"type":"string","enum":["ja","nee","zelf sturen","niet gevraagd"]},"details":{"type":"string"}},["name","phone","address","municipality","service","scope","start_time","end_time","photo_status","details"]),
    fn("send_email_summary","Stuur na toestemming de aanvraag naar info@luxwash.online.",{"service":{"type":"string"},"name":{"type":"string"},"summary":{"type":"string"}},["service","name","summary"]),
    fn("send_whatsapp_followup","Stuur alleen na aparte WhatsApp-toestemming een korte opvolging.",{"phone":{"type":"string"},"first_name":{"type":"string"},"service":{"type":"string"},"municipality":{"type":"string"}},["phone","first_name","service","municipality"]),
    fn("transfer_call","Verbind gesprek door naar medewerker.",{"reason":{"type":"string"}},["reason"]),
]

def _db():
    c=sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS calls (call_id TEXT PRIMARY KEY,summary_confirmed INTEGER DEFAULT 0,data_consent INTEGER DEFAULT 0,whatsapp_consent INTEGER DEFAULT 0,tentative_created INTEGER DEFAULT 0,email_sent INTEGER DEFAULT 0,whatsapp_sent INTEGER DEFAULT 0,updated_at TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT,call_id TEXT,action TEXT,ok INTEGER,detail TEXT,created_at TEXT)""")
    c.commit(); return c

def _ensure(call_id):
    c=_db(); c.execute("INSERT OR IGNORE INTO calls(call_id,updated_at) VALUES(?,?)",(call_id,datetime.now(TZ).isoformat())); c.commit(); c.close()

def _set(call_id,field,value):
    _ensure(call_id); c=_db(); c.execute(f"UPDATE calls SET {field}=?,updated_at=? WHERE call_id=?",(1 if value else 0,datetime.now(TZ).isoformat(),call_id)); c.commit(); c.close()

def _get(call_id):
    _ensure(call_id); c=_db(); row=c.execute("SELECT summary_confirmed,data_consent,whatsapp_consent,tentative_created,email_sent,whatsapp_sent FROM calls WHERE call_id=?",(call_id,)).fetchone(); c.close(); return dict(zip(["summary_confirmed","data_consent","whatsapp_consent","tentative_created","email_sent","whatsapp_sent"],map(bool,row)))

def _audit(call_id,action,ok,detail=""):
    c=_db(); c.execute("INSERT INTO audit(call_id,action,ok,detail,created_at) VALUES(?,?,?,?,?)",(call_id,action,1 if ok else 0,str(detail)[:1000],datetime.now(TZ).isoformat())); c.commit(); c.close()

def google_creds():
    from google.oauth2.credentials import Credentials
    needed=["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"]
    miss=[x for x in needed if not os.getenv(x)]
    if miss: raise RuntimeError("Google OAuth ontbreekt: "+", ".join(miss))
    return Credentials(token=None,refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],token_uri="https://oauth2.googleapis.com/token",client_id=os.environ["GOOGLE_CLIENT_ID"],client_secret=os.environ["GOOGLE_CLIENT_SECRET"],scopes=["https://www.googleapis.com/auth/calendar","https://www.googleapis.com/auth/gmail.send"])

def _parse_hm(s):
    h,m=map(int,s.split(":")); return time(h,m)

def _sanitize_phone(phone):
    p=re.sub(r"[^\d+]","",phone)
    if p.startswith("00"): p="+"+p[2:]
    if p.startswith("0") and not p.startswith("+"): p="+32"+p[1:]
    return p

class ToolRuntime:
    def __init__(self,call_id): self.call_id=call_id; _ensure(call_id)
    def execute(self,name,args):
        methods={"check_calendar":self.check_calendar,"mark_summary_confirmed":self.mark_summary_confirmed,"mark_data_transfer_consent":self.mark_data_transfer_consent,"mark_whatsapp_consent":self.mark_whatsapp_consent,"create_tentative_request":self.create_tentative_request,"send_email_summary":self.send_email_summary,"send_whatsapp_followup":self.send_whatsapp_followup,"transfer_call":self.transfer_call}
        return methods[name](**args) if name in methods else {"ok":False,"error":"unknown_tool"}
    def mark_summary_confirmed(self,confirmed):
        _set(self.call_id,"summary_confirmed",confirmed)
        if not confirmed: _set(self.call_id,"data_consent",False)
        _audit(self.call_id,"summary_confirmed",True,confirmed); return {"ok":True,"summary_confirmed":confirmed}
    def mark_data_transfer_consent(self,consent):
        state=_get(self.call_id)
        if consent and not state["summary_confirmed"]: return {"ok":False,"error":"summary_not_confirmed"}
        _set(self.call_id,"data_consent",consent); _audit(self.call_id,"data_consent",True,consent); return {"ok":True,"data_transfer_consent":consent}
    def mark_whatsapp_consent(self,consent):
        _set(self.call_id,"whatsapp_consent",consent); _audit(self.call_id,"whatsapp_consent",True,consent); return {"ok":True,"whatsapp_consent":consent}
    def check_calendar(self,date,window_start,window_end,duration_minutes,timezone):
        if timezone!="Europe/Brussels": return {"ok":False,"error":"invalid_timezone"}
        d=datetime.strptime(date,"%Y-%m-%d").date(); start=datetime.combine(d,_parse_hm(window_start),TZ); end=datetime.combine(d,_parse_hm(window_end),TZ); start=max(start,datetime.combine(d,time(8),TZ)); end=min(end,datetime.combine(d,time(20),TZ))
        if end<=start: return {"ok":False,"error":"outside_opening_hours","options":[]}
        from googleapiclient.discovery import build
        service=build("calendar","v3",credentials=google_creds(),cache_discovery=False)
        fb=service.freebusy().query(body={"timeMin":start.isoformat(),"timeMax":end.isoformat(),"timeZone":"Europe/Brussels","items":[{"id":CALENDAR_ID}]}).execute()
        busy=[]
        for x in fb["calendars"][CALENDAR_ID].get("busy",[]): busy.append((datetime.fromisoformat(x["start"].replace("Z","+00:00")).astimezone(TZ),datetime.fromisoformat(x["end"].replace("Z","+00:00")).astimezone(TZ)))
        options=[]; cursor=start; dur=timedelta(minutes=int(duration_minutes))
        while cursor+dur<=end and len(options)<3:
            cend=cursor+dur
            if not any(cursor<b1 and cend>b0 for b0,b1 in busy): options.append({"start":cursor.isoformat(),"end":cend.isoformat(),"provisional":True})
            cursor+=timedelta(minutes=30)
        return {"ok":True,"timezone":"Europe/Brussels","options":options,"definitive":False}
    def create_tentative_request(self,name,phone,address,municipality,service,scope,start_time,end_time,photo_status,details):
        state=_get(self.call_id)
        if not state["summary_confirmed"]: return {"ok":False,"error":"summary_not_confirmed"}
        if not state["data_consent"]: return {"ok":False,"error":"data_transfer_consent_missing"}
        st=datetime.fromisoformat(start_time).astimezone(TZ); en=datetime.fromisoformat(end_time).astimezone(TZ)
        if st.time()<time(8) or en.time()>time(20) or st.date()!=en.date(): return {"ok":False,"error":"outside_opening_hours"}
        title=f"AANVRAAG – {service} – {name} – {municipality}"
        desc=f"Status: voorlopig / persoonlijk bevestigen\nNaam: {name}\nTelefoon: {phone}\nAdres: {address}\nGemeente: {municipality}\nDienst: {service}\nOmvang: {scope}\nFoto-status: {photo_status}\nBijzonderheden: {details}\n\nNog persoonlijk bevestigen"
        from googleapiclient.discovery import build
        cal=build("calendar","v3",credentials=google_creds(),cache_discovery=False)
        event=cal.events().insert(calendarId=CALENDAR_ID,sendUpdates="none",body={"summary":title,"description":desc,"location":address,"start":{"dateTime":st.isoformat(),"timeZone":"Europe/Brussels"},"end":{"dateTime":en.isoformat(),"timeZone":"Europe/Brussels"},"transparency":"opaque","visibility":"private"}).execute()
        _set(self.call_id,"tentative_created",True); return {"ok":True,"status":"voorlopig","event_id":event.get("id"),"title":title,"definitive":False}
    def send_email_summary(self,service,name,summary):
        state=_get(self.call_id)
        if not state["summary_confirmed"] or not state["data_consent"]: return {"ok":False,"error":"consent_gate_not_satisfied"}
        from googleapiclient.discovery import build
        gmail=build("gmail","v1",credentials=google_creds(),cache_discovery=False)
        msg=EmailMessage(); msg["To"]=INTERNAL_EMAIL; msg["Subject"]=f"Nieuwe telefonische aanvraag – {service} – {name}"; msg.set_content(summary+"\n\nStatus: persoonlijk bevestigen\nGeen audio-opname toegevoegd.")
        raw=base64.urlsafe_b64encode(msg.as_bytes()).decode(); result=gmail.users().messages().send(userId="me",body={"raw":raw}).execute(); _set(self.call_id,"email_sent",True); return {"ok":True,"message_id":result.get("id"),"to":INTERNAL_EMAIL}
    def send_whatsapp_followup(self,phone,first_name,service,municipality):
        if not _get(self.call_id)["whatsapp_consent"]: return {"ok":False,"error":"whatsapp_consent_missing"}
        token=os.getenv("META_WHATSAPP_TOKEN"); number_id=os.getenv("META_WHATSAPP_PHONE_NUMBER_ID"); api_version=os.getenv("META_GRAPH_VERSION","v23.0")
        if not token or not number_id: return {"ok":False,"error":"whatsapp_not_configured","fallback":"Vraag klant zelf foto’s te sturen naar +32 53 89 64 00."}
        text=f"Dag {first_name}, bedankt voor uw aanvraag bij Luxwash voor {service} in {municipality}. U mag de gevraagde foto’s via WhatsApp sturen. De prijs, datum en planning worden persoonlijk door Luxwash bevestigd."
        r=requests.post(f"https://graph.facebook.com/{api_version}/{number_id}/messages",headers={"Authorization":f"Bearer {token}","Content-Type":"application/json"},json={"messaging_product":"whatsapp","to":_sanitize_phone(phone).replace("+",""),"type":"text","text":{"body":text}},timeout=20)
        return {"ok":True} if r.ok else {"ok":False,"error":"whatsapp_send_failed","fallback":"Klant kan zelf foto’s sturen naar +32 53 89 64 00."}
    def transfer_call(self,reason):
        key=os.getenv("OPENAI_API_KEY")
        if not key: return {"ok":False,"error":"openai_key_missing","fallback":"callback"}
        r=requests.post(f"https://api.openai.com/v1/realtime/calls/{self.call_id}/refer",headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"},json={"target_uri":f"tel:{TRANSFER_NUMBER}"},timeout=20)
        return {"ok":True,"status":"transferring","target":TRANSFER_NUMBER} if r.ok else {"ok":False,"error":"transfer_failed","fallback":"callback"}

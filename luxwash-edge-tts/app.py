import os
import time
import hmac
import hashlib
import tempfile
from collections import defaultdict

import edge_tts
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

app = FastAPI(title="LuxWash Edge TTS", docs_url=None, redoc_url=None)
VOICE = "nl-BE-DenaNeural"
RATE = "-4%"
COOKIE_NAME = "luxwash_player"
SESSION_SECONDS = 7 * 24 * 60 * 60
ATTEMPTS = defaultdict(list)

BRIEFING = os.environ.get("BRIEFING_TEXT", "Goedenavond. Controleer de afspraken, klantopvolging, prijspagina en materiaal voor morgen.")

class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=12000)

class Login(BaseModel):
    password: str = Field(min_length=1, max_length=200)

def _secret():
    password = os.getenv("PLAYER_PASSWORD", "")
    token = os.getenv("TTS_API_TOKEN", "")
    if not password or not token:
        raise HTTPException(status_code=503, detail="Player configuration incomplete")
    return password, token

def _session_key():
    password, token = _secret()
    return hashlib.sha256((password + "\0" + token).encode()).digest()

def _valid_session(request: Request):
    raw = request.cookies.get(COOKIE_NAME, "")
    try:
        expires, signature = raw.split(".", 1)
        expiry = int(expires)
        if expiry < time.time() or expiry > time.time() + SESSION_SECONDS + 60:
            return False
        expected = hmac.new(_session_key(), ("player:" + expires).encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)
    except (ValueError, AttributeError, HTTPException):
        return False

def _require_session(request: Request):
    if not _valid_session(request):
        raise HTTPException(status_code=401, detail="Meld u eerst aan")

async def _synthesize(text: str):
    fd, path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    try:
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)
        if os.path.getsize(path) < 100:
            raise RuntimeError("Empty audio")
    except Exception:
        if os.path.exists(path):
            os.unlink(path)
        raise HTTPException(status_code=502, detail="De Vlaamse spraakdienst is tijdelijk niet beschikbaar")
    return FileResponse(
        path, media_type="audio/mpeg", filename="luxwash-avondbriefing-dena.mp3",
        background=BackgroundTask(lambda: os.path.exists(path) and os.unlink(path)),
        headers={"Cache-Control": "no-store"}
    )

PLAYER_HTML = r"""<!doctype html>
<html lang="nl-BE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#15191f"><title>LuxWash | Vlaamse avondbriefing</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#11151b;color:#f5f6f8}
*{box-sizing:border-box}body{margin:0;padding:24px 14px}.wrap{max-width:720px;margin:35px auto}
h1{font-size:clamp(28px,6vw,42px);letter-spacing:-1px;margin:12px 0}p{line-height:1.6;color:#bec6d0}
.brand{font-size:14px;font-weight:800;letter-spacing:3px;color:#daba76}.card{border:1px solid #39414c;border-radius:20px;background:#1c222a;padding:24px;margin-top:22px;box-shadow:0 20px 55px #0004}
label{display:block;font-size:14px;font-weight:650;margin:15px 0 7px}
input,textarea{display:block;width:100%;border:1px solid #626975;border-radius:12px;background:#10151c;color:white;padding:14px;font:inherit}
textarea{min-height:310px;resize:vertical;line-height:1.55}
button,.download{font:inherit;font-weight:700;padding:13px 17px;border:0;border-radius:12px;cursor:pointer;text-decoration:none;display:inline-flex;justify-content:center;align-items:center;gap:7px}
.primary{background:#dabd7f;color:#151515}.secondary{background:#303a46;color:#fff}
.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}
audio{width:100%;margin-top:18px}.small{font-size:13px;color:#adb6c0}#message{min-height:24px}
[hidden]{display:none!important}
</style></head><body>
<main class="wrap"><div class="brand">LUXWASH · MOBIELE REINIGING</div><h1>Vlaamse avondbriefing</h1>
<p>Beluister de planning met de natuurlijke Vlaamse Dena-stem, vier procent trager. De geheime spraak-API-sleutel blijft op de server.</p>
<section id="login" class="card" hidden><h2>Beveiligde toegang</h2>
<form id="loginForm"><label for="password">Toegangscode</label><input id="password" type="password" required autocomplete="current-password">
<div class="actions"><button class="primary" type="submit">Aanmelden</button></div></form></section>
<section id="player" class="card" hidden><h2>Planning beluisteren</h2>
<p class="small">De tekst hieronder is aanpasbaar. Er wordt niets naar klanten verzonden.</p>
<label for="script">Tekst van de briefing</label><textarea id="script" maxlength="12000"></textarea>
<div class="actions"><button class="primary" id="generate" type="button">▶ Genereer en speel af</button>
<a id="download" class="download secondary" hidden download="luxwash-avondbriefing-dena.mp3">MP3 bewaren</a>
<button class="secondary" id="logout" type="button">Afmelden</button></div>
<audio id="audio" controls hidden preload="none"></audio></section>
<p id="message" role="status" aria-live="polite"></p>
</main>
<script>
const $=id=>document.getElementById(id);let audioUrl=null;
function message(s){$('message').textContent=s;}
async function refresh(){
  try{
    const r=await fetch('/api/briefing',{cache:'no-store'});
    if(!r.ok){$('login').hidden=false;$('player').hidden=true;return;}
    const d=await r.json();$('script').value=d.text;
    $('login').hidden=true;$('player').hidden=false;message('Gereed om af te spelen.');
  }catch(e){message('Kan geen verbinding maken met de dienst. Probeer later opnieuw.');}
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();message('Toegang controleren...');
  const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});
  $('password').value='';
  if(!r.ok){message(r.status===429?'Te veel pogingen. Probeer over vijftien minuten opnieuw.':'Onjuiste code of dienst tijdelijk niet beschikbaar.');return;}
  await refresh();
});
$('generate').addEventListener('click',async()=>{
  const text=$('script').value.trim();
  if(!text){message('Vul eerst de briefingtekst in.');return;}
  $('generate').disabled=true;message('Vlaamse MP3 wordt aangemaakt...');
  try{
    const r=await fetch('/api/audio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
    if(!r.ok){if(r.status===401){$('player').hidden=true;$('login').hidden=false;}throw new Error(r.status===429?'Te veel aanvragen. Probeer later opnieuw.':r.status===502?'De spraakprovider is momenteel onbereikbaar.':'Aanmaken mislukt (HTTP '+r.status+').');}
    const blob=await r.blob();if(blob.size<100)throw new Error('Leeg audiobestand ontvangen.');
    if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);
    $('audio').src=audioUrl;$('audio').hidden=false;$('download').href=audioUrl;$('download').hidden=false;
    message('MP3 klaar. Afspelen of bewaren.');
    try{await $('audio').play();}catch(e){message('MP3 klaar. Tik op afspelen.');}
  }catch(e){message(e.message||'Onbekende fout.');}
  finally{$('generate').disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  await fetch('/logout',{method:'POST'});if(audioUrl)URL.revokeObjectURL(audioUrl);
  $('audio').removeAttribute('src');$('audio').hidden=true;$('download').hidden=true;
  $('player').hidden=true;$('login').hidden=false;message('Afgemeld.');
});
refresh();
</script></body></html>"""

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    if request.url.path == "/":
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
            "connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; "
            "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        )
    return response

@app.get("/", response_class=HTMLResponse)
def home():
    return HTMLResponse(PLAYER_HTML)

@app.get("/health")
def health():
    return {"status": "ok", "voice": VOICE, "rate": RATE, "player": "available"}

@app.post("/login")
def login(body: Login, request: Request):
    password, _ = _secret()
    address = request.client.host if request.client else "unknown"
    now = time.time()
    ATTEMPTS[address] = [t for t in ATTEMPTS[address] if now-t < 900]
    if len(ATTEMPTS[address]) >= 8:
        raise HTTPException(status_code=429, detail="Too many attempts")
    if not hmac.compare_digest(body.password, password):
        ATTEMPTS[address].append(now)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    ATTEMPTS.pop(address, None)
    expiry = str(int(now + SESSION_SECONDS))
    signature = hmac.new(_session_key(), ("player:" + expiry).encode(), hashlib.sha256).hexdigest()
    response = JSONResponse({"ok": True})
    response.set_cookie(COOKIE_NAME, expiry+"."+signature, max_age=SESSION_SECONDS,
                        secure=True, httponly=True, samesite="strict", path="/")
    return response

@app.post("/logout")
def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE_NAME, path="/", secure=True, httponly=True, samesite="strict")
    return response

@app.get("/api/briefing")
def get_briefing(request: Request):
    _require_session(request)
    return {"text": BRIEFING, "voice": VOICE, "rate": RATE}

@app.post("/api/audio")
async def player_audio(body: Speech, request: Request):
    _require_session(request)
    return await _synthesize(body.text)

# Keep the existing machine-to-machine endpoint compatible.
@app.post("/speech")
async def speech(body: Speech, authorization: str | None = Header(default=None)):
    token = os.environ.get("TTS_API_TOKEN", "")
    if not token or not authorization or not hmac.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await _synthesize(body.text)

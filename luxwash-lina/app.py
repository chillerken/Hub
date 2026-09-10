import asyncio, json, os, threading, logging, hashlib, hmac, base64
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlencode, parse_qs
import requests, websockets
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from openai import OpenAI, InvalidWebhookSignatureError

from tools import ToolRuntime, TOOL_DEFS

logging.basicConfig(level=os.getenv("LOG_LEVEL","INFO"))
log = logging.getLogger("luxwash-lina")
BASE = Path(__file__).resolve().parent
PROMPT = (BASE / "prompt.txt").read_text(encoding="utf-8")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY","")
OPENAI_WEBHOOK_SECRET = os.environ.get("OPENAI_WEBHOOK_SECRET","")
REALTIME_MODEL = os.environ.get("OPENAI_REALTIME_MODEL","gpt-realtime-2.1")
REALTIME_VOICE = os.environ.get("OPENAI_REALTIME_VOICE","").strip()
ZADARMA_NUMBER = os.getenv("ZADARMA_NUMBER", "+3228862134")
ZADARMA_SIP_URI = os.getenv("ZADARMA_SIP_URI", "sip:proj_LnR21kYyTndDqRQTmhNuooZR@sip-eu.api.openai.com;transport=tls")
SETUP_TOKEN = os.getenv("SETUP_TOKEN", "").strip()

if not OPENAI_API_KEY:
    log.warning("OPENAI_API_KEY ontbreekt; live calls zullen geweigerd worden.")

client = OpenAI(webhook_secret=OPENAI_WEBHOOK_SECRET) if OPENAI_WEBHOOK_SECRET else None
app = FastAPI(title="Luxwash Lina Phone Agent", version="1.2.0")
zadarma_state = {"configured": False, "status": "not_attempted"}
setup_consumed = False


def _zadarma_signature(method: str, params: dict, secret: str) -> str:
    params_str = urlencode(sorted(params.items()))
    md5_part = hashlib.md5(params_str.encode("utf-8")).hexdigest()
    payload = (method + params_str + md5_part).encode("utf-8")
    return base64.b64encode(hmac.new(secret.encode("utf-8"), payload, hashlib.sha1).digest()).decode("ascii")


def configure_zadarma_route(key: str | None = None, secret: str | None = None):
    key = (key or os.getenv("ZADARMA_API_KEY", "")).strip()
    secret = (secret or os.getenv("ZADARMA_API_SECRET", "")).strip()
    if not key or not secret:
        zadarma_state.update({"configured": False, "status": "credentials_missing"})
        log.info("Zadarma auto-routing wacht op ZADARMA_API_KEY en ZADARMA_API_SECRET.")
        return zadarma_state

    method = "/v1/direct_numbers/set_sip_id/"
    params = {"number": ZADARMA_NUMBER, "sip_id": ZADARMA_SIP_URI, "test_mode": "off", "type": "common"}
    signature = _zadarma_signature(method, params, secret)
    try:
        r = requests.put(
            "https://api.zadarma.com" + method,
            data=params,
            headers={"Authorization": f"{key}:{signature}", "Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
        try:
            body = r.json()
        except Exception:
            body = {"status": "error", "message": "non_json_response"}
        ok = r.ok and body.get("status") == "success"
        zadarma_state.update({"configured": ok, "status": "success" if ok else "api_error", "http_status": r.status_code})
        if ok:
            log.info("Zadarma nummerroute automatisch ingesteld naar OpenAI SIP.")
        else:
            log.error("Zadarma routeconfiguratie mislukt: HTTP %s, status=%s", r.status_code, body.get("status"))
        return {**zadarma_state, "provider_message": body.get("message")}
    except Exception as exc:
        zadarma_state.update({"configured": False, "status": "request_failed"})
        log.exception("Zadarma routeconfiguratie kon niet worden uitgevoerd.")
        return {**zadarma_state, "provider_message": str(exc)[:160]}


@app.on_event("startup")
def startup_config():
    configure_zadarma_route()


@app.get("/setup/zadarma", response_class=HTMLResponse)
def zadarma_setup_page(token: str = ""):
    if not SETUP_TOKEN or token != SETUP_TOKEN or setup_consumed:
        raise HTTPException(status_code=404, detail="Not found")
    return HTMLResponse(f"""
<!doctype html><html lang='nl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Luxwash Lina – Zadarma koppelen</title><style>body{{font-family:system-ui;background:#0f172a;color:#fff;max-width:620px;margin:40px auto;padding:24px}}.card{{background:#111827;padding:24px;border-radius:18px}}input{{width:100%;box-sizing:border-box;padding:14px;margin:8px 0 16px;border-radius:10px;border:1px solid #475569}}button{{width:100%;padding:14px;border:0;border-radius:10px;font-weight:700}}small{{color:#cbd5e1}}</style></head><body><div class='card'>
<h1>Luxwash Lina 📞</h1><p>Koppel Zadarma rechtstreeks aan Lina. De ingevoerde API-gegevens worden alleen gebruikt voor deze ene configuratie en niet opgeslagen.</p>
<form method='post' action='/setup/zadarma?token={token}'>
<label>Zadarma API key</label><input name='api_key' autocomplete='off' required>
<label>Zadarma API secret</label><input name='api_secret' type='password' autocomplete='off' required>
<button type='submit'>Koppel Zadarma automatisch</button></form>
<p><small>Nummer: {ZADARMA_NUMBER}<br>Doel: {ZADARMA_SIP_URI}</small></p></div></body></html>
""")


@app.post("/setup/zadarma", response_class=HTMLResponse)
async def zadarma_setup_submit(request: Request, token: str = ""):
    global setup_consumed
    if not SETUP_TOKEN or token != SETUP_TOKEN or setup_consumed:
        raise HTTPException(status_code=404, detail="Not found")
    raw = (await request.body()).decode("utf-8", errors="ignore")
    form = parse_qs(raw)
    key = (form.get("api_key") or [""])[0].strip()
    secret = (form.get("api_secret") or [""])[0].strip()
    if not key or not secret:
        return HTMLResponse("<h2>API key en secret zijn verplicht.</h2>", status_code=400)
    result = await asyncio.to_thread(configure_zadarma_route, key, secret)
    if result.get("configured"):
        setup_consumed = True
        return HTMLResponse("<h2>✅ Zadarma is gekoppeld aan Lina.</h2><p>De SIP-routering is succesvol ingesteld. U mag dit venster sluiten.</p>")
    return HTMLResponse(f"<h2>❌ Koppeling niet gelukt.</h2><p>Status: {result.get('status')}</p><p>Controleer uw Zadarma API-gegevens en probeer opnieuw.</p>", status_code=400)


@app.get("/health")
def health():
    required = {
        "OPENAI_API_KEY": bool(OPENAI_API_KEY),
        "OPENAI_WEBHOOK_SECRET": bool(OPENAI_WEBHOOK_SECRET),
        "GOOGLE_CLIENT_ID": bool(os.environ.get("GOOGLE_CLIENT_ID")),
        "GOOGLE_CLIENT_SECRET": bool(os.environ.get("GOOGLE_CLIENT_SECRET")),
        "GOOGLE_REFRESH_TOKEN": bool(os.environ.get("GOOGLE_REFRESH_TOKEN")),
    }
    return {"ok": all(required.values()), "required": required, "zadarma": zadarma_state, "whatsapp_configured": bool(os.environ.get("META_WHATSAPP_TOKEN") and os.environ.get("META_WHATSAPP_PHONE_NUMBER_ID")), "mode": "live-only"}


def openai_headers():
    return {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}


def accept_call(call_id: str):
    body: Dict[str, Any] = {"type": "realtime", "model": REALTIME_MODEL, "instructions": PROMPT, "tools": TOOL_DEFS, "tool_choice": "auto", "reasoning": {"effort": "low"}}
    if REALTIME_VOICE:
        body["audio"] = {"output": {"voice": REALTIME_VOICE}}
    r = requests.post(f"https://api.openai.com/v1/realtime/calls/{call_id}/accept", headers=openai_headers(), json=body, timeout=20)
    r.raise_for_status()


async def ws_loop(call_id: str):
    runtime = ToolRuntime(call_id=call_id)
    uri = f"wss://api.openai.com/v1/realtime?call_id={call_id}"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    try:
        async with websockets.connect(uri, additional_headers=headers, max_size=8_000_000) as ws:
            await ws.send(json.dumps({"type": "response.create", "response": {"instructions": 'Begin exact met: “Goeiedag, u bent bij Luxwash. Ik ben Lina, de digitale assistente. Waarmee kan ik u helpen?”'}}))
            async for raw in ws:
                event = json.loads(raw)
                et = event.get("type","")
                if et == "response.output_item.done":
                    item = event.get("item") or {}
                    if item.get("type") == "function_call":
                        await handle_tool(ws, runtime, item.get("name",""), item.get("arguments","{}"), item.get("call_id",""))
                elif et == "response.function_call_arguments.done":
                    await handle_tool(ws, runtime, event.get("name",""), event.get("arguments","{}"), event.get("call_id",""))
    except Exception:
        log.exception("Realtime websocket stopped for %s", call_id)


async def handle_tool(ws, runtime: ToolRuntime, name: str, arguments: str, tool_call_id: str):
    if not name or not tool_call_id:
        return
    try:
        args = json.loads(arguments or "{}")
    except json.JSONDecodeError:
        args = {}
    try:
        result = await asyncio.to_thread(runtime.execute, name, args)
    except Exception as exc:
        log.exception("Tool %s failed", name)
        result = {"ok": False, "error": "technical_failure", "detail": str(exc)[:250]}
    await ws.send(json.dumps({"type": "conversation.item.create", "item": {"type": "function_call_output", "call_id": tool_call_id, "output": json.dumps(result, ensure_ascii=False)}}))
    await ws.send(json.dumps({"type": "response.create"}))


@app.post("/openai/realtime-webhook")
async def realtime_webhook(request: Request):
    if not OPENAI_API_KEY or not OPENAI_WEBHOOK_SECRET or not client:
        raise HTTPException(status_code=503, detail="Server credentials missing")
    raw = await request.body()
    try:
        event = client.webhooks.unwrap(raw, request.headers)
    except InvalidWebhookSignatureError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Webhook parse error: {exc}")
    if event.type == "realtime.call.incoming":
        call_id = event.data.call_id
        try:
            accept_call(call_id)
        except Exception as exc:
            log.exception("Accept call failed")
            raise HTTPException(status_code=502, detail=f"Could not accept call: {exc}")
        threading.Thread(target=lambda: asyncio.run(ws_loop(call_id)), daemon=True).start()
    return JSONResponse({"ok": True})

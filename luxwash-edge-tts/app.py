import os, tempfile, hmac
import edge_tts
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

app = FastAPI(title="LuxWash Edge TTS", docs_url=None, redoc_url=None)
VOICE = "nl-BE-DenaNeural"
RATE = "-4%"
class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=12000)

@app.get("/health")
def health():
    return {"status": "ok", "voice": VOICE, "rate": RATE}

@app.post("/speech")
async def speech(body: Speech, authorization: str | None = Header(default=None)):
    token = os.environ.get("TTS_API_TOKEN", "")
    if not token or not authorization or not hmac.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    fd, path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    try:
        await edge_tts.Communicate(body.text, VOICE, rate=RATE).save(path)
        if os.path.getsize(path) == 0:
            raise RuntimeError("Empty audio")
    except Exception:
        os.unlink(path)
        raise HTTPException(status_code=502, detail="Speech generation unavailable")
    return FileResponse(path, media_type="audio/mpeg", filename="luxwash-briefing.mp3",
                        background=BackgroundTask(lambda: os.path.exists(path) and os.unlink(path)))

"""TimaLens Lab's server: the pages, the labs, generation from a lesson, the tutor.

    uvicorn app.server:app --port 8080

The Meta key stays here, on the server (MODEL_API_KEY); the browser never sees it.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import os
import re
import socket
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import APIConnectionError
from openai import APIError as ModelAPIError
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from starlette.middleware.gzip import GZipMiddleware

from app import generate, lesson, tutor, voice
from app.config import ROOT, settings
from app.meta import UNREACHABLE, MetaError, read_pages, transcribe

# the web app: a static Next.js export (frontend/), built by `make build` or the Dockerfile
WEB = Path(os.environ.get("WEB_DIR", ROOT / "frontend" / "out"))
# hand-written labs, each in French and in English
SAMPLE_LABS = {"sample-ohm": "ohm", "sample-lampes": "lampes"}
SAMPLES = {f"{key}-{lang}": ROOT / "samples" / f"{name}_{lang}.lab.json" for key, name in SAMPLE_LABS.items() for lang in ("fr", "en")}
MAX_UPLOAD = 50 * 1024 * 1024
SAFE_ID = re.compile(r"^[a-z0-9-]{3,64}$")
BENCH_PICTURE = re.compile(r"^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")
MAX_PICTURE = 3_000_000  # characters of base64: a screenshot of the bench, not a photo album

app = FastAPI(title="TimaLens Lab")
app.add_middleware(GZipMiddleware, minimum_size=1024)  # phones on 2G; Tima's streamed answers are left as they are


@app.middleware("http")
async def cache_built_assets(request: Request, call_next):
    """The app's scripts and styles have their content's hash in their name: a phone keeps them for good."""
    response = await call_next(request)
    if request.url.path.startswith("/_next/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response
jobs: dict[str, dict[str, Any]] = {}


def labs_dir() -> Path:
    path = settings().data_dir / "labs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def sessions_dir() -> Path:
    path = settings().data_dir / "sessions"
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_stored(lab_id: str) -> dict[str, Any]:
    if not SAFE_ID.match(lab_id) or not (labs_dir() / f"{lab_id}.json").exists():
        raise HTTPException(404, "no such lab")
    return json.loads((labs_dir() / f"{lab_id}.json").read_text())


def read_lab(lab_id: str) -> tuple[dict[str, Any], str]:
    """A lab (with the ids of its translations) and the lesson text it was made from."""
    if lab_id in SAMPLES:
        lab = json.loads(SAMPLES[lab_id].read_text())
        base = lab_id.rsplit("-", 1)[0]
        lab["origin"] = "sample"
        lab["translations"] = {lang: f"{base}-{lang}" for lang in ("fr", "en")}
        return lab, lab["summary"]
    stored = read_stored(lab_id)
    lab = stored["lab"]
    lab["translations"] = {**stored.get("translations", {}), (lab.get("language") or "")[:2]: lab_id}
    return lab, stored.get("lesson", "")


@app.get("/api/health")
def health() -> dict[str, Any]:
    cfg = settings()
    meta = urlparse(cfg.planner_base_url or cfg.base_url).hostname or ""
    return {"meta_key": bool(cfg.api_key), "planner": cfg.planner_model, "open_weight_planner": cfg.planner_is_open_weight,
            "live_ears": bool(cfg.api_key), "voice": "voxtral" if cfg.tts_api_key else "browser", "meta_reachable": reachable(meta)}


_reach: dict[str, tuple[float, bool]] = {}


def reachable(host: str, port: int = 443) -> bool:
    """Can this server open a connection to the model API? Checked at most once a minute."""
    if not host:
        return False
    at, ok = _reach.get(host, (0.0, False))
    if time.monotonic() - at > 60:
        try:
            socket.create_connection((host, port), timeout=3).close()
            ok = True
        except OSError:
            ok = False
        _reach[host] = (time.monotonic(), ok)
    return ok


def problem(exc: Exception) -> str:
    """What to tell the teacher when a model call fails."""
    return UNREACHABLE if isinstance(exc, APIConnectionError) else str(exc)


@app.get("/api/labs/{lab_id}")
def get_lab(lab_id: str) -> JSONResponse:
    lab, _ = read_lab(lab_id)
    return JSONResponse(lab)


@app.get("/api/labs")
def list_labs(lang: str = "") -> list[dict[str, Any]]:
    """The labs to offer: the samples in the visitor's language, then the labs teachers made
    (each once: a translation is reached from its lab)."""
    out = []
    for k, v in SAMPLES.items():
        if lang in ("fr", "en") and not k.endswith(f"-{lang}"):
            continue
        sample = json.loads(v.read_text())
        out.append({"id": k, "title": sample["title"], "origin": "sample", "view": sample.get("view", "2d")})
    for path in sorted(labs_dir().glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:40]:
        stored = json.loads(path.read_text())
        if stored.get("source"):
            continue
        lab_id = stored.get("translations", {}).get(lang, path.stem) if lang else path.stem
        title = stored["lab"]["title"] if lab_id == path.stem else read_stored(lab_id)["lab"]["title"]
        out.append({"id": lab_id, "title": title, "origin": "generated", "view": stored["lab"].get("view", "2d")})
    return out


class TranslateRequest(BaseModel):
    language: str


@app.post("/api/labs/{lab_id}/translate")
def translate(lab_id: str, body: TranslateRequest) -> dict[str, str]:
    """The lab in another language, made once by Muse Spark and kept with its lab."""
    language = body.language.strip()
    code = re.sub(r"[^a-z0-9]+", "", language.lower())[:20]
    if not code:
        raise HTTPException(400, "which language?")
    lab, lesson_text = read_lab(lab_id)
    if lab.get("translations", {}).get(code):
        return {"id": lab["translations"][code]}
    if lab.get("origin") == "sample":
        raise HTTPException(400, "the samples come in French and English")
    stored = read_stored(lab_id)
    source_id = stored.get("source") or lab_id
    try:
        translated = generate.translate_lab(settings(), stored["lab"], code)
    except MetaError as exc:
        raise HTTPException(503, str(exc)) from exc
    new_id = f"{source_id}-{code}"[:64]
    family = {**read_stored(source_id).get("translations", {}), (read_stored(source_id)["lab"].get("language") or "")[:2]: source_id, code: new_id}
    doc = {"lab": translated, "lesson": lesson_text, "source": source_id, "translations": family}
    (labs_dir() / f"{new_id}.json").write_text(json.dumps(doc, ensure_ascii=False))
    for member in set(family.values()) - {new_id}:  # every version knows every other
        doc = read_stored(member)
        doc["translations"] = family
        (labs_dir() / f"{member}.json").write_text(json.dumps(doc, ensure_ascii=False))
    return {"id": new_id}


def _read_upload(name: str, data: bytes) -> str:
    cfg = settings()
    with tempfile.TemporaryDirectory() as work:
        path = Path(work) / name
        path.write_bytes(data)
        return lesson.extract_text(path, transcriber=lambda wav: transcribe(cfg, wav), reader=lambda pages: read_pages(cfg, pages))


def _lesson_title(text: str) -> str:
    """The lesson's first real line: usually its title."""
    for line in text.splitlines():
        line = line.strip(" #*\t")
        if 4 <= len(line) <= 90:
            return line
    return ""


def _run_generation(job_id: str, upload: tuple[str, bytes] | None, text: str, language: str, level: str, view: str = "auto") -> None:
    """Make the lab in the background. Each step goes into the job's events, as facts (not
    sentences): the teacher's page has Tima say them, in the teacher's language."""
    job = jobs[job_id]

    def note(kind: str, **facts: Any) -> None:
        job["events"].append({"kind": kind, **facts})
        if kind == "designed":
            job["draft"] = {k: facts.get(k) for k in ("title", "objectives")}

    try:
        def progress(stage: str, detail: str = "") -> None:
            job.update(stage=stage, detail=detail)

        if upload is not None:
            try:
                text = _read_upload(*upload)
            except lesson.LessonError as exc:
                job.update(stage="failed", detail=str(exc))
                note("failed", detail=str(exc))
                return
        text = text.strip()
        if len(text) < 200:
            job.update(stage="failed", detail="the lesson is too short: give at least a few paragraphs")
            note("failed", detail="too short")
            return
        job["lesson"] = text[:60_000]  # Tima answers the teacher's questions from it while the lab is made
        note("read", chars=len(text), words=len(text.split()), title=_lesson_title(text))

        # the same lesson asked again (a second class, a retry on a bad connection) is not
        # designed twice: its lab is already there
        key = hashlib.sha256(f"{language}|{level}|{view}|{text}".encode()).hexdigest()[:12]
        if (labs_dir() / f"{key}.json").exists():
            note("reused")
            job.update(stage="ready", lab=key, detail="already made from this lesson")
            note("ready", lab=key)
            return
        lab = generate.lab_from_lesson(settings(), text, language=language, level=level, view=view, progress=progress, note=note)
        (labs_dir() / f"{key}.json").write_text(json.dumps({"lab": lab, "lesson": text[:200_000]}, ensure_ascii=False))
        job.update(stage="ready", lab=key)
        note("ready", lab=key, title=lab.get("title", ""))
    except generate.Unsupported as exc:
        job.update(stage="unsupported", detail=str(exc))
        note("unsupported", detail=str(exc))
    except Exception as exc:  # reported to the teacher, never swallowed
        job.update(stage="failed", detail=problem(exc)[:500])
        note("failed", detail=problem(exc)[:300])


@app.post("/api/labs")
async def create_lab(file: UploadFile | None = File(None), text: str = Form(""), language: str = Form("auto"), level: str = Form(""),
                     view: str = Form("auto")) -> dict[str, str]:
    """Start making a lab; the teacher follows the job. Reading a photo or a recording takes
    a model call, so it happens in the job too."""
    upload: tuple[str, bytes] | None = None
    if file is not None and file.filename:
        upload = (Path(file.filename).name, await file.read())
        if len(upload[1]) > MAX_UPLOAD:
            raise HTTPException(413, "the file is too large (50 MB at most)")
    elif len(text.strip()) < 200:
        raise HTTPException(400, "the lesson is too short: give at least a few paragraphs")
    job_id = uuid.uuid4().hex[:12]
    kind = Path(upload[0]).suffix.lower().lstrip(".") if upload else "text"
    jobs[job_id] = {"stage": "reading", "detail": upload[0] if upload else "", "events": [{"kind": "reading", "source": kind}]}
    threading.Thread(target=_run_generation, args=(job_id, upload, text, language, level, view if view in ("2d", "3d") else "auto"), daemon=True).start()
    return {"job": job_id}


PRIVATE_JOB_KEYS = {"lesson", "draft"}  # for Tima's answers, not sent on every poll


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str) -> dict[str, Any]:
    if job_id not in jobs:
        raise HTTPException(404, "no such job")
    return {k: v for k, v in jobs[job_id].items() if k not in PRIVATE_JOB_KEYS}


class JobQuestion(BaseModel):
    question: str
    history: list[dict[str, str]] = []
    language: str = ""


@app.post("/api/jobs/{job_id}/ask")
def ask_while_making(job_id: str, body: JobQuestion) -> dict[str, str]:
    """The teacher talks with Tima while the lab is being made, about the lesson and the lab."""
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "no such job")
    try:
        answer = tutor.while_making(settings(), job.get("lesson", ""), job.get("draft"), job.get("stage", ""), body.question[:2000],
                                    body.history, language=body.language)
    except (MetaError, ModelAPIError) as exc:
        raise HTTPException(503, problem(exc)) from exc
    return {"answer": answer}


class TutorQuestion(BaseModel):
    question: str
    history: list[dict[str, str]] = []
    context: dict[str, Any] = {}
    language: str = ""
    image: str = ""  # the student's bench, as a data URL, for Muse Spark's vision


def _tutor_call(lab_id: str, body: TutorQuestion) -> tuple[dict[str, Any], dict[str, Any]]:
    lab, lesson_text = read_lab(lab_id)
    if body.image and (len(body.image) > MAX_PICTURE or not BENCH_PICTURE.match(body.image)):
        raise HTTPException(400, "the bench picture must be a JPEG, PNG or WebP data URL of at most 3 MB")
    args = {"lab": lab, "lesson": lesson_text, "question": body.question, "history": body.history, "context": body.context,
            "language": body.language, "image": body.image}
    return lab, args


@app.post("/api/labs/{lab_id}/tutor")
def ask_tutor(lab_id: str, body: TutorQuestion) -> dict[str, str]:
    _, args = _tutor_call(lab_id, body)
    try:
        return {"answer": tutor.answer(settings(), **args)}
    except (MetaError, ModelAPIError) as exc:
        raise HTTPException(503, problem(exc)) from exc


@app.post("/api/labs/{lab_id}/tutor/stream")
def ask_tutor_streaming(lab_id: str, body: TutorQuestion) -> StreamingResponse:
    """The tutor's answer as server-sent events: {"delta"} as it is written, then {"done"}."""
    _, args = _tutor_call(lab_id, body)
    parts = tutor.stream(settings(), **args)
    try:
        first = next(parts, "")  # a missing key fails here, as a proper 503
    except (MetaError, ModelAPIError) as exc:
        raise HTTPException(503, problem(exc)) from exc

    def events():
        try:
            for delta in itertools.chain([first], parts):
                if delta:
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield 'data: {"done": true}\n\n'
        except Exception as exc:  # the student hears what was said so far, then the engine's fallback
            yield f"data: {json.dumps({'error': str(exc)[:200]})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------- Tima's live voice
@app.websocket("/api/live")
async def live_ears(ws: WebSocket) -> None:
    """The microphone, relayed to Muse Voice Transcribe realtime; transcripts come back."""
    await ws.accept()
    start = await ws.receive_json()
    await voice.relay(ws, settings(), str(start.get("language", "fr")))
    await ws.close()


class SpeakRequest(BaseModel):
    text: str
    language: str = "fr"


@app.post("/api/tts")
async def tts(body: SpeakRequest) -> Response:
    """One sentence of Tima's, spoken by Voxtral. 503: no voice here, the browser speaks from now on;
    502: Voxtral refused this sentence, the browser says just this one."""
    text = body.text.strip()[:600]
    if not text:
        raise HTTPException(400, "nothing to say")
    if not settings().tts_api_key:
        raise HTTPException(503, "MISTRAL_API_KEY is not set: the browser's voice speaks instead")
    try:
        audio = await voice.speak(settings(), text, body.language)
    except (voice.VoiceError, httpx.HTTPError) as exc:
        raise HTTPException(502, str(exc)[:200]) from exc
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------- sessions: a student's lab, replayable
MAX_SESSION = 2 * 1024 * 1024
SESSION_KINDS = {"start", "circuit", "mode", "predict", "measure", "success", "tutor", "quiz", "view"}


@app.post("/api/labs/{lab_id}/sessions")
async def save_session(lab_id: str, request: Request) -> dict[str, str]:
    """Keep a session's event log (a few KB); the video is rendered from it, on any device."""
    read_lab(lab_id)  # the lab must exist
    body = await request.body()
    if len(body) > MAX_SESSION:
        raise HTTPException(413, "this session is too large")
    try:
        doc = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "not JSON") from exc
    events = doc.get("events") if isinstance(doc, dict) else None
    if not isinstance(events, list) or not all(isinstance(e, dict) and e.get("kind") in SESSION_KINDS for e in events):
        raise HTTPException(400, "not a lab session")
    doc["lab"] = lab_id
    session_id = uuid.uuid4().hex[:12]
    (sessions_dir() / f"{session_id}.json").write_text(json.dumps(doc, ensure_ascii=False))
    return {"id": session_id}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> dict[str, Any]:
    if not SAFE_ID.match(session_id) or not (sessions_dir() / f"{session_id}.json").exists():
        raise HTTPException(404, "no such session")
    doc = json.loads((sessions_dir() / f"{session_id}.json").read_text())
    lab, _ = read_lab(doc["lab"])
    return {"session": doc, "lab": lab}


async def _ffmpeg(*args: str, timeout: int = 600) -> bool:
    """Run ffmpeg off the event loop, so a long conversion never stalls other requests."""
    command = [settings().ffmpeg, "-y", "-loglevel", "error", *args]
    done = await run_in_threadpool(subprocess.run, command, capture_output=True, timeout=timeout, check=False)
    return done.returncode == 0


@app.post("/api/video/mp4")
async def to_mp4(request: Request) -> Response:
    """A browser that could only record WebM gets an H.264 MP4 back (for WhatsApp and phones)."""
    body = await request.body()
    if len(body) > 300 * 1024 * 1024:
        raise HTTPException(413, "this video is too large")
    with tempfile.TemporaryDirectory() as work:
        source, out = Path(work) / "in.webm", Path(work) / "out.mp4"
        source.write_bytes(body)
        if not await _ffmpeg("-i", str(source), "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
                             "-movflags", "+faststart", "-an", str(out)):
            raise HTTPException(400, "the video could not be converted")
        return Response(out.read_bytes(), media_type="video/mp4")


@app.post("/api/transcribe")
async def transcribe_question(audio: UploadFile = File(...), language: str = Form("fr")) -> dict[str, str]:
    cfg = settings()
    with tempfile.TemporaryDirectory() as work:
        source = Path(work) / "question.webm"
        source.write_bytes(await audio.read())
        wav = Path(work) / "question.wav"
        if not await _ffmpeg("-i", str(source), "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", str(wav), timeout=120):
            raise HTTPException(400, "the recording could not be read")
        try:
            return {"text": await run_in_threadpool(transcribe, cfg, wav, language=language[:2])}
        except MetaError as exc:
            raise HTTPException(503, str(exc)) from exc


# ---------------------------------------------------------------- the pages
NOT_BUILT = """<!doctype html><meta charset="utf-8"><title>TimaLens Lab</title>
<p style="font:16px system-ui;margin:40px">The web app is not built yet: run <code>make build</code>,
or <code>make dev</code> and open <a href="http://localhost:3000">localhost:3000</a>.</p>"""


def page(name: str) -> Response:
    path = WEB / f"{name}.html"
    return FileResponse(path) if path.exists() else HTMLResponse(NOT_BUILT, status_code=503)


@app.get("/")
def home() -> Response:
    return page("index")


@app.get("/lab")
def lab_page() -> Response:
    return page("lab")


@app.get("/replay")
def replay_page() -> Response:
    return page("replay")


@app.get("/{name}.html")
def old_page(name: str, request: Request) -> RedirectResponse:
    """Links shared before the Next.js app (lab.html?lab=…, replay.html?session=…) still work."""
    if name not in ("index", "lab", "replay"):
        raise HTTPException(404, "no such page")
    target = "/" if name == "index" else f"/{name}"
    return RedirectResponse(f"{target}?{request.url.query}" if request.url.query else target, status_code=301)


app.mount("/samples", StaticFiles(directory=ROOT / "samples"), name="samples")
if WEB.exists():
    app.mount("/", StaticFiles(directory=WEB), name="web")

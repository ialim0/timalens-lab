"""Tima's live voice, on the server (the keys never reach the browser).

- Ears: the browser streams its microphone here; it is relayed to Muse Voice Transcribe's
  realtime endpoint, which sends back live transcripts and tells when the student has
  finished speaking (endpointing). Her name is passed as a keyword, so it is heard right.
- Mouth: Voxtral TTS (Mistral) reads Tima's sentences aloud, when MISTRAL_API_KEY is set.
  Without it, the browser's own voice speaks.

The realtime protocol follows the Meta Model API: a JSON handshake, 80 ms chunks of mono
16-bit PCM at 24 kHz, then speechStart / transcript / speechEnd / speechComplete events.
"""

from __future__ import annotations

import asyncio
import base64
import json
import uuid
from typing import Any

import httpx
import websockets
from fastapi import WebSocket, WebSocketDisconnect

from app.config import Settings

LANGUAGES = {"fr": "French", "en": "English"}
# what the lab's vocabulary sounds like: biasing the recogniser towards it
KEYWORDS = ["Tima", "Hey Tima", "LED", "DEL", "ampèremètre", "voltmètre", "ammeter", "voltmeter", "ohm"]
EVENTS = {"speechStart", "transcript", "speechEnd", "speechComplete", "error"}
FALLBACK_VOICE = "gb_jane_neutral"


class VoiceError(RuntimeError):
    """Tima's voice could not do what was asked; the message says why."""


# ---------------------------------------------------------------- ears: Muse Voice Transcribe, realtime
def handshake(cfg: Settings, language: str) -> dict[str, Any]:
    first = LANGUAGES.get(language[:2], "French")
    return {
        "mode": "ENDPOINTING",
        "authorization": {"accessToken": f"Bearer {cfg.api_key}"},
        "audioEncoding": "PCM_24KHZ",
        "model": cfg.asr_model,
        "partialMode": "CUMULATIVE",
        "emitAudioProgress": False,
        "languageBias": [first, *(name for name in LANGUAGES.values() if name != first)],  # students switch languages
        "keywords": KEYWORDS,
    }


def realtime_url(cfg: Settings) -> str:
    """The realtime endpoint, with a session id of ours (Meta logs it and sends it back)."""
    return f"{cfg.asr_realtime_url}?sessionId=timalens-{uuid.uuid4().hex[:16]}"


async def connect(cfg: Settings) -> Any:
    """The realtime connection to Meta (a function of its own, so tests can stand in for it)."""
    return await websockets.connect(realtime_url(cfg), max_size=1 << 20, open_timeout=15, ping_interval=20)


async def relay(browser: WebSocket, cfg: Settings, language: str) -> None:
    """Carry the browser's microphone to Muse Voice Transcribe, and its events back."""
    if not cfg.api_key:
        await browser.send_json({"type": "error", "message": "MODEL_API_KEY is not set"})
        return
    try:
        meta = await connect(cfg)
    except Exception as exc:  # reported to the browser, which falls back on its own ears
        await browser.send_json({"type": "error", "message": f"Muse Voice Transcribe is unreachable ({type(exc).__name__})"})
        return
    try:
        await meta.send(json.dumps(handshake(cfg, language)))
        hello = json.loads(await asyncio.wait_for(meta.recv(), timeout=10))
        if hello.get("type") == "error" or not hello.get("sessionId"):
            await browser.send_json({"type": "error", "message": str(hello.get("message") or hello)[:200]})
            return
        await browser.send_json({"type": "ready"})

        async def upstream() -> None:
            try:
                while True:
                    message = await browser.receive()
                    if message["type"] == "websocket.disconnect":
                        break
                    if message.get("bytes"):
                        await meta.send(message["bytes"])
                    elif message.get("text") and json.loads(message["text"]).get("type") == "stop":
                        break
            except WebSocketDisconnect:
                pass
            await meta.send('{"type":"endStream"}')

        async def downstream() -> None:
            async for raw in meta:
                if not isinstance(raw, str):
                    continue
                event = json.loads(raw)
                if event.get("type") in EVENTS:
                    await browser.send_json({k: event[k] for k in ("type", "turnId", "transcript", "final", "message") if k in event})

        tasks = [asyncio.create_task(upstream()), asyncio.create_task(downstream())]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            if task.exception() and not isinstance(task.exception(), (WebSocketDisconnect, websockets.ConnectionClosed)):
                raise task.exception()
    finally:
        await meta.close()


# ---------------------------------------------------------------- mouth: Voxtral TTS
_voices: dict[str, str] = {}


async def _voice_for(cfg: Settings, client: httpx.AsyncClient, language: str) -> str:
    """The configured voice for a language, else the first of Mistral's voices for it."""
    chosen = {"fr": cfg.tts_voice_fr, "en": cfg.tts_voice_en}.get(language, "")
    if chosen:
        return chosen
    if language not in _voices:
        _voices[language] = FALLBACK_VOICE  # Voxtral voices speak every supported language
        try:
            r = await client.get(f"{cfg.tts_base_url}/audio/voices", headers={"Authorization": f"Bearer {cfg.tts_api_key}"})
            listed = r.json() if r.status_code == 200 else []
            listed = listed.get("data", listed.get("voices", [])) if isinstance(listed, dict) else listed
            for voice in listed:
                vid = str(voice.get("id") or voice.get("voice_id") or "")
                langs = " ".join(map(str, voice.get("languages") or [voice.get("language", "")])).lower()
                if vid.lower().startswith(f"{language}_") or language in langs.split() or LANGUAGES.get(language, "?").lower() in langs:
                    _voices[language] = vid
                    break
        except (httpx.HTTPError, ValueError, AttributeError):
            pass
    return _voices[language]


async def speak(cfg: Settings, text: str, language: str) -> bytes:
    """One sentence of Tima's, as MP3."""
    if not cfg.tts_api_key:
        raise VoiceError("MISTRAL_API_KEY is not set: the browser's voice speaks instead")
    async with httpx.AsyncClient(timeout=30) as client:
        voice = await _voice_for(cfg, client, language[:2])
        r = await client.post(
            f"{cfg.tts_base_url}/audio/speech",
            headers={"Authorization": f"Bearer {cfg.tts_api_key}"},
            json={"model": cfg.tts_model, "input": text, "voice_id": voice, "response_format": "mp3"},
        )
    if r.status_code != 200:
        raise VoiceError(f"Voxtral TTS answered {r.status_code}: {r.text[:200]}")
    body = r.json()
    if not body.get("audio_data"):
        raise VoiceError("Voxtral TTS sent no audio")
    return base64.b64decode(body["audio_data"])

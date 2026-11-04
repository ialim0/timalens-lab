"""Meta's models, as the Meta Model API serves them (https://api.meta.ai/v1).

- Muse Spark 1.3 (chat completions, structured output): designs the lab from the lesson,
  and is the students' tutor.
- Muse Spark's vision: reads a lesson that was photographed or scanned (a blackboard, a
  notebook, a textbook page).
- Muse Voice Transcribe: turns a recorded lesson, and the students' spoken questions, into text.

The request shapes follow Meta's cookbook (github.com/meta-models/meta-model-cookbook).
The planner may run on open weights instead: any OpenAI-compatible server
(PLANNER_BASE_URL), e.g. vLLM serving Muse Spark Open.
"""

from __future__ import annotations

import base64
import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
from openai import OpenAI

from app.config import Settings


class MetaError(RuntimeError):
    """A Meta model could not do what was asked; the message says why."""


UNREACHABLE = "Meta's API cannot be reached from this network (the connection times out): try another network, or the deployed app."
# a model may think for minutes, but a connection that does not open in seconds will not open
TIMEOUT = httpx.Timeout(600, connect=8)


def _client(cfg: Settings, *, planner: bool = False) -> OpenAI:
    if planner and cfg.planner_is_open_weight:
        return OpenAI(base_url=cfg.planner_base_url, api_key=cfg.planner_api_key or "none", timeout=TIMEOUT, max_retries=1)
    if not cfg.api_key:
        raise MetaError("MODEL_API_KEY is not set: create a key in the Meta Model API dashboard.")
    return OpenAI(base_url=cfg.base_url, api_key=cfg.api_key, timeout=TIMEOUT, max_retries=1)


# ---------------------------------------------------------------- Muse Spark: JSON out
def _json_from(text: str) -> Any:
    """The JSON in a reply: the whole reply, or its first fenced or braced block."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        return json.loads(fenced.group(1))
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])
    raise MetaError("the model's reply held no JSON")


def chat_json(cfg: Settings, messages: list[dict[str, Any]], *, schema: dict[str, Any] | None = None,
              name: str = "answer", effort: str | None = None, model: str | None = None,
              on_thought: Callable[[str], None] | None = None) -> Any:
    """Ask Muse Spark (or the open-weight planner) for a JSON answer.

    With a schema, the reply is constrained to it (structured output); without one, the
    JSON is taken from the reply. With on_thought, the request goes through the Responses API,
    which streams summaries of the model's reasoning: on_thought gets each one as it is written.
    """
    if on_thought is not None and not cfg.planner_is_open_weight:
        return _thinking_json(cfg, messages, schema=schema, name=name, effort=effort, model=model, on_thought=on_thought)
    client = _client(cfg, planner=True)
    kwargs: dict[str, Any] = {"model": model or cfg.planner_model, "messages": messages}
    if schema is not None:
        kwargs["response_format"] = {"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": False}}
    if not cfg.planner_is_open_weight:
        kwargs["reasoning_effort"] = effort or cfg.planner_effort
    reply = client.chat.completions.create(**kwargs)
    content = reply.choices[0].message.content or ""
    try:
        return _json_from(content)
    except (json.JSONDecodeError, MetaError) as exc:
        raise MetaError(f"the planner's reply was not JSON: {content[:300]}") from exc


def _thinking_json(cfg: Settings, messages: list[dict[str, Any]], *, schema: dict[str, Any] | None, name: str,
                   effort: str | None, model: str | None, on_thought: Callable[[str], None]) -> Any:
    """The Responses API, streamed: reasoning summaries as they come, then the JSON answer.

    Structured output is text.format here (response_format is the Chat Completions parameter),
    and summaries arrive as response.reasoning_summary_text.done events. A summary is not
    guaranteed for every response: without one, nothing is said.
    """
    kwargs: dict[str, Any] = {"model": model or cfg.planner_model, "input": messages,
                              "reasoning": {"effort": effort or cfg.planner_effort, "summary": "auto"}, "stream": True}
    if schema is not None:
        kwargs["text"] = {"format": {"type": "json_schema", "name": name, "schema": schema, "strict": False}}
    written, final = [], ""
    for event in _client(cfg, planner=True).responses.create(**kwargs):
        kind = getattr(event, "type", "")
        if kind == "response.reasoning_summary_text.done" and getattr(event, "text", "").strip():
            on_thought(event.text.strip())
        elif kind == "response.output_text.delta":
            written.append(event.delta)
        elif kind == "response.completed":
            final = getattr(event.response, "output_text", "") or ""
        elif kind in ("response.failed", "error"):
            raise MetaError(f"Muse Spark stopped: {getattr(event, 'message', None) or kind}")
    content = "".join(written) or final
    try:
        return _json_from(content)
    except (json.JSONDecodeError, MetaError) as exc:
        raise MetaError(f"the planner's reply was not JSON: {content[:300]}") from exc


# ---------------------------------------------------------------- Muse Spark: reading pages
READ_PAGES = """\
These are photos or scans of a teacher's lesson: a textbook or notebook page, a blackboard,
a handout. Write out the lesson they hold, in its own language, as plain text: every heading,
definition, formula (in plain text, e.g. U = R x I), worked example and exercise, in order.
Describe each circuit diagram in words: its parts, their values and how they are connected
(in series or in parallel, where the meters are). Write only the lesson, nothing else."""


def image_type(data: bytes) -> str:
    """The MIME type of image bytes, from their signature."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    raise MetaError("unknown image format: use JPEG, PNG or WebP")


def read_pages(cfg: Settings, images: list[bytes]) -> str:
    """The text of a lesson photographed or scanned, read by Muse Spark's vision."""
    content: list[dict[str, Any]] = [{"type": "text", "text": READ_PAGES}]
    for data in images[:12]:
        content.append({"type": "image_url", "image_url": {"url": f"data:{image_type(data)};base64,{base64.b64encode(data).decode()}"}})
    kwargs: dict[str, Any] = {"model": cfg.planner_model, "messages": [{"role": "user", "content": content}]}
    if not cfg.planner_is_open_weight:
        kwargs["reasoning_effort"] = "low"
    reply = _client(cfg, planner=True).chat.completions.create(**kwargs)
    return (reply.choices[0].message.content or "").strip()


# ---------------------------------------------------------------- Muse Voice Transcribe
def transcribe(cfg: Settings, wav: Path, *, language: str | None = None) -> str:
    """The words of a recorded lecture (a WAV of at most 10 minutes and 32 MB)."""
    if not cfg.api_key:
        raise MetaError("MODEL_API_KEY is not set: transcription runs on the Meta Model API.")
    request: dict[str, Any] = {"mode": "ENDPOINTING", "model": cfg.asr_model, "audioEncoding": "WAV"}
    if language:
        request["languageBias"] = [language]
    try:
        with wav.open("rb") as audio:
            response = httpx.post(
                f"{cfg.base_url.rstrip('/')}/asr/transcribe",
                headers={"Authorization": f"Bearer {cfg.api_key}"},
                files={"request": (None, json.dumps(request), "application/json"), "audio": (wav.name, audio)},
                timeout=600,
            )
    except httpx.HTTPError as exc:
        raise MetaError(f"the Meta Model API is unreachable ({type(exc).__name__})") from exc
    if response.status_code != 200:
        raise MetaError(f"Muse Voice Transcribe answered {response.status_code}: {response.text[:300]}")
    body = response.json()
    turns = body.get("turns")
    return "\n".join(t.get("transcript", "") for t in turns) if turns else body.get("transcript", "")

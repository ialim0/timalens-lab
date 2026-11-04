"""The lab's tutor: Muse Spark, grounded in the teacher's lesson and in what the student's
circuit is doing right now (the engine's numbers, never invented ones). With a picture of the
student's bench, Muse Spark's vision also sees how they built it."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from app.config import Settings
from app.meta import _client

RULES = """\
You are the tutor of a virtual electric-circuits lab, for the lesson below. A student is
working in the lab right now; you see their circuit as the lab's engine solved it: every
part, its value, the voltage across it and the current through it, and what they are
trying to do (an activity step or a challenge) and their measurements.

How you help:
- Answer in the student's language, simply, at the lesson's level, in 2 to 5 short sentences.
- Use the lesson's notation and the real numbers from their circuit. Never invent a
  reading; if a number is not in the circuit, say how to measure it.
- Guide rather than tell: for a challenge, never give the final value; ask a question or
  give the next step of the reasoning (Socratic method).
- If they hold a misconception the lesson warns about, name it kindly and show what in
  their own circuit contradicts it.
- If something is dangerous in real life (a short circuit, a burnt LED), say why, briefly.
- Stay on the lesson and the lab.
- You may also get a picture of the student's bench (the schematic or the 3D table). Use it to
  see what they built and where things are, and name the parts by their labels (R1, L2...).
  For any number, trust the engine's values over what the picture seems to show.
- You are Tima, and your answer is spoken aloud: no lists, no markdown, no formulas in LaTeX.
"""


LANGUAGES = {"fr": "French", "en": "English"}


def _request(cfg: Settings, lab: dict[str, Any], lesson: str, question: str,
             history: list[dict[str, str]], context: dict[str, Any], *, language: str = "", image: str = "") -> dict[str, Any]:
    """The chat request: rules, lesson, conversation, then the question with the solved circuit
    (and, when given, a data URL picture of the student's bench)."""
    grounding = {
        "lesson_title": lab.get("title"), "summary": lab.get("summary"), "objectives": lab.get("objectives"),
        "formulas": lab.get("formulas"), "misconceptions": lab.get("misconceptions"),
    }
    messages: list[dict[str, Any]] = [
        {"role": "developer", "content": RULES},
        {"role": "developer", "content": "The lesson:\n" + lesson[:60_000] + "\n\nThe lab: " + json.dumps(grounding, ensure_ascii=False)},
    ]
    for turn in history[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"][:2000]})
    speak = LANGUAGES.get(language[:2], "")
    if speak:  # the student chose the interface's language: answer in it, whatever the lesson's
        messages.append({"role": "developer", "content": f"Answer in {speak}, using the usual school words of {speak}."})
    circuit = json.dumps(context, ensure_ascii=False)[:12000]
    text = f"{question}\n\n[The student's circuit, as the lab's engine solved it: {circuit}]"
    if image:  # Muse Spark's vision looks at the bench, as the student sees it right now
        text += "\n[A picture of the student's bench, as it is on their screen, is attached.]"
        content: Any = [{"type": "text", "text": text}, {"type": "image_url", "image_url": {"url": image}}]
    else:
        content = text
    messages.append({"role": "user", "content": content})
    kwargs: dict[str, Any] = {"model": cfg.tutor_model, "messages": messages}
    if not cfg.planner_is_open_weight:
        kwargs["reasoning_effort"] = "low"  # a tutor answers fast
    return kwargs


def answer(cfg: Settings, lab: dict[str, Any], lesson: str, question: str,
           history: list[dict[str, str]], context: dict[str, Any], *, language: str = "", image: str = "") -> str:
    """Muse Spark's whole answer."""
    kwargs = _request(cfg, lab, lesson, question, history, context, language=language, image=image)
    reply = _client(cfg, planner=True).chat.completions.create(**kwargs)
    return (reply.choices[0].message.content or "").strip()


TEACHER_RULES = """\
You are Tima, the voice of TimaLens Lab. A teacher has just given you a lesson, and Muse Spark
is designing an interactive electric-circuits lab from it, in the background, right now (the
circuits, guided experiments, challenges and a quiz; a physics engine then checks every circuit).
Talk with the teacher while they wait: answer their questions about their lesson, about how the
lab will use it, or about teaching it. Use their lesson; never invent what it does not say.
Your answer is spoken aloud: 2 to 4 short sentences, warm and concrete, no lists, no markdown.
"""


def while_making(cfg: Settings, lesson: str, draft: dict[str, Any] | None, stage: str, question: str,
                 history: list[dict[str, str]], *, language: str = "") -> str:
    """Tima's answer to the teacher while the lab is being made."""
    status = f"The lab is at this stage: {stage or 'reading the lesson'}."
    if draft:
        status += " Muse Spark's current draft: " + json.dumps(draft, ensure_ascii=False)
    messages: list[dict[str, Any]] = [
        {"role": "developer", "content": TEACHER_RULES},
        {"role": "developer", "content": ("The lesson:\n" + lesson[:60_000]) if lesson else "The lesson is still being read."},
        {"role": "developer", "content": status},
    ]
    for turn in history[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"][:2000]})
    speak = LANGUAGES.get(language[:2], "")
    if speak:
        messages.append({"role": "developer", "content": f"Answer in {speak}."})
    messages.append({"role": "user", "content": question})
    kwargs: dict[str, Any] = {"model": cfg.tutor_model, "messages": messages}
    if not cfg.planner_is_open_weight:
        kwargs["reasoning_effort"] = "low"
    reply = _client(cfg, planner=True).chat.completions.create(**kwargs)
    return (reply.choices[0].message.content or "").strip()


def stream(cfg: Settings, lab: dict[str, Any], lesson: str, question: str,
           history: list[dict[str, str]], context: dict[str, Any], *, language: str = "", image: str = "") -> Iterator[str]:
    """Muse Spark's answer as it is written: Tima starts speaking its first sentence at once."""
    kwargs = _request(cfg, lab, lesson, question, history, context, language=language, image=image)
    client = _client(cfg, planner=True)  # raises MetaError before anything is streamed
    for chunk in client.chat.completions.create(**kwargs, stream=True):
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta

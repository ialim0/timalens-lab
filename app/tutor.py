"""The lab's tutor: Muse Spark, grounded in the teacher's lesson and in what the student's
circuit is doing right now (the engine's numbers, never invented ones)."""

from __future__ import annotations

import json
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
"""


LANGUAGES = {"fr": "French", "en": "English"}


def answer(cfg: Settings, lab: dict[str, Any], lesson: str, question: str,
           history: list[dict[str, str]], context: dict[str, Any], *, language: str = "") -> str:
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
    messages.append({"role": "user", "content": f"{question}\n\n[The student's circuit, as the lab's engine solved it: {circuit}]"})
    kwargs: dict[str, Any] = {"model": cfg.planner_model, "messages": messages}
    if not cfg.planner_is_open_weight:
        kwargs["reasoning_effort"] = "low"  # a tutor answers fast
    reply = _client(cfg, planner=True).chat.completions.create(**kwargs)
    return (reply.choices[0].message.content or "").strip()

"""From a lesson to a lab: Muse Spark designs it, the circuit engine checks it.

Muse Spark reads the whole lesson (its context holds a full course) and writes the lab as
JSON in the format below. The engine (frontend/src/lab/labcheck.js, run with Node) lays out and
solves every preset circuit and proves every challenge can be met with the controls the
student may touch. Anything wrong goes back to the model in the checker's words, up to
three times. The model configures the lab; it never computes the physics.
"""

from __future__ import annotations

import json
import logging
import subprocess
from collections.abc import Callable
from typing import Any

from app.config import ROOT, Settings
from app.meta import CutShort, MetaError, chat_json

MAX_TRIES = 3
log = logging.getLogger("timalens.generate")


class Unsupported(ValueError):
    """The lesson is not one this lab can teach (yet)."""


FORMAT = """\
You design an interactive electric-circuits lab (DC) from a teacher's lesson. Students
build and change real circuits in the lab; a deterministic engine computes every voltage
and current. You only configure the lab. Answer with ONE JSON object, nothing else:

{
 "version": 1, "lab": "circuits",
 "language": "fr" | "en" | ... (the lesson's language; write everything in it),
 "title": "...", "level": "...",
 "summary": "2-3 sentences: what the lesson teaches",
 "view": "2d" | "3d": how the lab opens. "3d" (real parts on a lab table: batteries, resistors
   with their colour bands, glowing bulbs, multimeters) when the lesson is about real apparatus,
   building a circuit by hand, safety, or students who have never seen the parts; "2d" (the
   schematic) when the lesson works with circuit diagrams and symbols. The student can switch.
 "objectives": ["3 to 5 things the student will be able to do"],
 "formulas": [{"text": "U = R × I", "meaning": "units and what each letter is"}],
 "misconceptions": ["mistakes students make about this lesson, each with the truth"],
 "presets": [ circuits the activities and challenges start from:
   {"id": "short_id", "title": "...", "topology": "series" | "parallel" | "series_parallel",
    "battery": {"V": 1.5 to 24},
    "elements": [ 1 to 4 of:
       {"id": "R1", "type": "resistor", "R": 1 to 1000},
       {"id": "L1", "type": "bulb", "R": 2 to 200, "P": rated watts, e.g. 3},
       {"id": "D1", "type": "led"} (red LED: about 2 V, 30 mA max; it burns above that),
       {"id": "S1", "type": "switch", "closed": true | false} ],
    "ammeter": true (an ammeter A1 in the main line),
    "voltmeter_on": "R1" (optional: a voltmeter V1 across that element),
    "branch_ammeters": true (optional, parallel only: ammeters A2, A3... in each branch)} ],
   series: elements one after another; parallel: one branch per element (2 or more);
   series_parallel: the first element in series, the others in parallel after it.
   The battery is always B1. Never short the battery: every loop needs a resistor, bulb or LED.
 "activities": [ 2 or 3 guided experiments, each on a preset:
   {"id", "title", "preset": "preset id", "steps": [
      {"kind": "predict", "question", "choices": [...], "answer": index, "why"},
      {"kind": "do", "instruction", "goals": [goals, optional: completed when met]},
      {"kind": "measure", "instruction", "points": 3 to 6} (each new reading is recorded automatically and drawn on U(I)),
      {"kind": "observe", "question"} ],
    "takeaway": "the idea to remember"} ],
   Use predict, then do or measure, then observe: the student commits to a prediction
   before testing it.
 "challenges": [ 2 or 3 problems the engine checks:
   {"id", "title", "statement", "preset", "locked": ["B1"] (parts the student cannot change),
    "goals": [goals, all must hold], "hint": "a hint that guides without giving the answer"} ],
 "quiz": [3 to 5 {"question", "choices", "answer": index, "explanation"}, from the lesson]
}

A goal is one of:
 {"quantity": "current" | "voltage" | "power" | "brightness", "component": "R1" (an element,
  B1, A1 or V1 of that preset), "min": number, "max": number}  (SI units: A, V, W; brightness 0 to 1)
 {"lit": "D1"}, {"not_burnt": true}, {"not_shorted": true}
Give ranges a tolerance of 5 to 10% (the student sets values with sliders: batteries in
0.5 V steps, resistances in the E12 series). Every challenge must be achievable by
changing the parts that are not locked, and must NOT already be met by the preset as it
starts (the student has to change something).
Stay faithful to the lesson: its notation (U or V), its level, its examples.
If the lesson has nothing to do with electric circuits, answer {"lab": "unsupported",
"reason": "..."} in the lesson's language.
"""

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "lab": {"type": "string"}, "language": {"type": "string"}, "title": {"type": "string"},
        "summary": {"type": "string"}, "objectives": {"type": "array", "items": {"type": "string"}},
        "presets": {"type": "array", "items": {"type": "object"}},
        "activities": {"type": "array", "items": {"type": "object"}},
        "challenges": {"type": "array", "items": {"type": "object"}},
        "quiz": {"type": "array", "items": {"type": "object"}},
    },
    "required": ["lab"],
}


def check(lab: dict[str, Any], node: str) -> list[str]:
    """The circuit engine's problems with a lab (empty when it is ready)."""
    run = subprocess.run([node, str(ROOT / "tools" / "check_lab.mjs"), "-"], input=json.dumps(lab), capture_output=True, text=True, timeout=120)
    try:
        return json.loads(run.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError) as exc:
        raise RuntimeError(f"the lab checker failed: {run.stderr[:300]}") from exc


THINK_ALOUD = """The teacher hears the summaries of your reasoning read aloud while you work: write
your reasoning in {language}, plainly, about the lab you are designing for their lesson."""


def lab_from_lesson(cfg: Settings, text: str, *, language: str = "auto", level: str = "", view: str = "auto",
                    progress: Callable[[str, str], None] = lambda stage, detail="": None,
                    note: Callable[..., None] = lambda kind, **facts: None, teacher: str = "") -> dict[str, Any]:
    """A checked lab for a lesson. Raises Unsupported for a lesson the lab cannot teach.
    view: "2d" or "3d" when the teacher chose; "auto" lets Muse Spark choose from the lesson.
    note(kind, **facts) reports each step as it happens (Tima tells the teacher about it)."""
    wishes = [f"level: {level}" if level else "", f"write the lab in {language}" if language not in ("", "auto") else "",
              f'the teacher wants "view": "{view}"' if view in ("2d", "3d") else ""]
    wishes = "; ".join(w for w in wishes if w)
    ask = f"The lesson{f' ({wishes})' if wishes else ''}:\n\n{text[:400_000]}"
    messages: list[dict[str, Any]] = [{"role": "developer", "content": FORMAT}, {"role": "user", "content": ask}]
    if teacher in ("French", "English"):  # Tima reads Muse Spark's reasoning to the teacher, in their language
        messages.insert(1, {"role": "developer", "content": THINK_ALOUD.format(language=teacher)})
    problems: list[str] = []
    effort = None  # the configured effort; less if an answer is cut short
    for attempt in range(1, MAX_TRIES + 1):
        progress("designing", f"Muse Spark, attempt {attempt}")
        note("designing", attempt=attempt)
        try:
            lab = chat_json(cfg, messages, schema=SCHEMA, name="circuits_lab", model=cfg.design_model, effort=effort,
                            on_thought=lambda thought: note("thinking", text=thought[:400]))
        except CutShort:
            # the reasoning used the room the lab needed: think less, write the whole lab
            effort = "minimal" if effort == "low" else "low"
            problems = ["the answer was cut short"]
            continue
        if not isinstance(lab, dict):
            raise MetaError("the planner did not return a JSON object")
        if lab.get("lab") == "unsupported":
            raise Unsupported(lab.get("reason") or "this lesson is not about electric circuits")
        note("designed", title=lab.get("title", ""), circuits=len(lab.get("presets") or []), activities=len(lab.get("activities") or []),
             challenges=len(lab.get("challenges") or []), view=lab.get("view", ""), objectives=(lab.get("objectives") or [])[:3])
        progress("checking", "laying out and solving every circuit")
        note("checking")
        problems = check(lab, cfg.node)
        note("problems" if problems else "checked", count=len(problems))
        if problems:
            log.warning("attempt %d: %d problems (%s); the lab's keys: %s", attempt, len(problems), "; ".join(problems[:4]), sorted(lab)[:20])
        if not problems:
            lab.setdefault("version", 1)
            if view in ("2d", "3d"):
                lab["view"] = view
            return lab
        messages += [{"role": "assistant", "content": json.dumps(lab, ensure_ascii=False)},
                     {"role": "user", "content": "The lab engine found these problems:\n- " + "\n- ".join(problems[:30])
                      + "\nReturn the whole corrected lab as one JSON object."}]
    raise MetaError(f"the lab still had problems after {MAX_TRIES} attempts: {'; '.join(problems[:5])}")


# ---------------------------------------------------------------- translation
# Muse Spark translates a lab's words; the structure (ids, values, goals, answer indexes) must
# come back identical, and the engine checks the result again, so a translation can never
# change the physics or make a quiz answer point at the wrong choice.
TEXT_KEYS = {"title", "level", "summary", "objectives", "text", "meaning", "misconceptions", "question", "choices",
             "why", "instruction", "takeaway", "statement", "hint", "explanation", "reason"}
SKIP_KEYS = {"language", "origin", "translations"}

TRANSLATE = """\
Translate this interactive electric-circuits lab into {language}, for students at its level.
Translate every text a student or a teacher reads: title, level, summary, objectives,
formulas (the meaning; keep the letters of each formula as the lesson wrote them),
misconceptions, the titles, questions, choices, instructions, explanations, hints,
statements and takeaways. Keep everything else exactly as it is: every id, type, number,
topology, goal and lock, and the order of every list and of every set of choices (the
answer indexes must still point at the right choice). Use the usual school vocabulary of
{language}. Answer with the whole lab as ONE JSON object, with "language": "{code}"."""


def skeleton(value: Any, key: str = "") -> Any:
    """A lab with its words blanked: what a translation must leave unchanged."""
    if isinstance(value, dict):
        return {k: skeleton(v, k) for k, v in sorted(value.items()) if k not in SKIP_KEYS}
    if isinstance(value, list):
        return [skeleton(v, key) for v in value]
    if isinstance(value, str) and key in TEXT_KEYS:
        return "…"
    return value


def _differences(a: Any, b: Any, path: str = "lab") -> list[str]:
    if type(a) is not type(b):
        return [f"{path}: was {json.dumps(a, ensure_ascii=False)[:60]}, became {json.dumps(b, ensure_ascii=False)[:60]}"]
    if isinstance(a, dict):
        out = [f"{path}.{k}: missing" for k in a if k not in b] + [f"{path}.{k}: added" for k in b if k not in a]
        for k in a:
            if k in b:
                out += _differences(a[k], b[k], f"{path}.{k}")
        return out
    if isinstance(a, list):
        if len(a) != len(b):
            return [f"{path}: {len(a)} items became {len(b)}"]
        return [d for i, (x, y) in enumerate(zip(a, b, strict=True)) for d in _differences(x, y, f"{path}[{i}]")]
    return [] if a == b else [f"{path}: {json.dumps(a, ensure_ascii=False)[:60]} became {json.dumps(b, ensure_ascii=False)[:60]}"]


LANGUAGE_NAMES = {"fr": "French", "en": "English"}


def translate_lab(cfg: Settings, lab: dict[str, Any], language: str) -> dict[str, Any]:
    """The lab in another language, with its structure proven unchanged."""
    name = LANGUAGE_NAMES.get(language, language)
    source = {k: v for k, v in lab.items() if k not in SKIP_KEYS}
    messages: list[dict[str, Any]] = [
        {"role": "developer", "content": TRANSLATE.format(language=name, code=language)},
        {"role": "user", "content": json.dumps(source, ensure_ascii=False)},
    ]
    problems: list[str] = []
    for _ in range(MAX_TRIES):
        out = chat_json(cfg, messages, schema=SCHEMA, name="circuits_lab", effort="low")
        if not isinstance(out, dict):
            raise MetaError("the translation was not a JSON object")
        problems = _differences(skeleton(source), skeleton(out))[:20]
        if not problems:
            problems = check(out, cfg.node)
        if not problems:
            out["language"] = language
            return out
        messages += [{"role": "assistant", "content": json.dumps(out, ensure_ascii=False)},
                     {"role": "user", "content": "Only the words may change. These changed too:\n- " + "\n- ".join(problems)
                      + "\nReturn the whole lab again, with only its words translated."}]
    raise MetaError(f"the translation kept changing the lab: {'; '.join(problems[:3])}")

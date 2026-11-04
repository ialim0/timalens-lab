"""The server, lesson reading and the design loop, with Muse Spark replaced by a fake:
these run offline. The real models are exercised by running the app with MODEL_API_KEY."""

from __future__ import annotations

import asyncio
import copy
import json
import shutil
import time

import pytest
from fastapi.testclient import TestClient

from app import generate, lesson, server, tutor, voice
from app.config import ROOT, settings

SAMPLE = json.loads((ROOT / "samples" / "ohm_fr.lab.json").read_text())
LESSON_PDF = ROOT / "samples" / "lecon_loi_ohm.pdf"


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(server, "reachable", lambda host, port=443: True)  # tests never touch the network
    server.jobs.clear()
    return tmp_path


# ---------------------------------------------------------------- lesson reading
def test_reads_the_sample_pdf():
    text = lesson.extract_text(LESSON_PDF)
    assert "loi d'Ohm" in text and "U = R × I" in text


def test_reads_text_and_rejects_unknown_files(tmp_path):
    (tmp_path / "cours.txt").write_text("La loi d'Ohm")
    assert lesson.extract_text(tmp_path / "cours.txt") == "La loi d'Ohm"
    (tmp_path / "x.xyz").write_text("?")
    with pytest.raises(lesson.LessonError):
        lesson.extract_text(tmp_path / "x.xyz")


def test_photos_go_to_the_vision_reader(tmp_path):
    photo = tmp_path / "tableau.jpg"
    photo.write_bytes(b"\xff\xd8\xff" + b"0" * 100)
    seen = []
    assert lesson.extract_text(photo, reader=lambda pages: seen.append(pages) or "le cours") == "le cours"
    assert seen and seen[0][0].startswith(b"\xff\xd8\xff")
    with pytest.raises(lesson.LessonError):
        lesson.extract_text(photo)  # no reader, no model: say so


# ---------------------------------------------------------------- the design loop
def test_the_engine_accepts_the_sample():
    assert generate.check(SAMPLE, settings().node) == []


def test_the_engine_rejects_an_impossible_challenge():
    lab = copy.deepcopy(SAMPLE)
    lab["challenges"][0]["goals"] = [{"quantity": "current", "component": "D1", "min": 5, "max": 6}]
    problems = generate.check(lab, settings().node)
    assert any("led20" in p for p in problems), problems


def test_problems_go_back_to_the_model(monkeypatch):
    broken = copy.deepcopy(SAMPLE)
    broken["challenges"][0]["preset"] = "nowhere"
    replies = [broken, SAMPLE]
    asked = []

    def fake_chat(cfg, messages, **kw):
        asked.append(copy.deepcopy(messages))
        return copy.deepcopy(replies.pop(0))

    monkeypatch.setattr(generate, "chat_json", fake_chat)
    lab = generate.lab_from_lesson(settings(), "La loi d'Ohm " * 40)
    assert lab["title"] == SAMPLE["title"] and len(asked) == 2
    assert "nowhere" in asked[1][-1]["content"]  # the checker's words reached the model


def test_an_unrelated_lesson_is_unsupported(monkeypatch):
    monkeypatch.setattr(generate, "chat_json", lambda *a, **k: {"lab": "unsupported", "reason": "c'est un cours d'histoire"})
    with pytest.raises(generate.Unsupported, match="histoire"):
        generate.lab_from_lesson(settings(), "La Révolution française " * 40)


# ---------------------------------------------------------------- the server
def wait(client, job):
    for _ in range(100):
        status = client.get(f"/api/jobs/{job}").json()
        if status["stage"] in ("ready", "failed", "unsupported"):
            return status
        time.sleep(0.05)
    raise AssertionError("the job never finished")


def test_upload_a_pdf_and_open_its_lab(monkeypatch):
    calls = []
    monkeypatch.setattr(generate, "chat_json", lambda cfg, messages, **k: calls.append(messages) or copy.deepcopy(SAMPLE))
    client = TestClient(server.app)
    with LESSON_PDF.open("rb") as pdf:
        job = client.post("/api/labs", files={"file": ("lecon.pdf", pdf, "application/pdf")}, data={"level": "4e"}).json()["job"]
    status = wait(client, job)
    assert status["stage"] == "ready", status
    assert "U = R × I" in calls[0][1]["content"]  # Muse Spark got the lesson's text
    assert client.get(f"/api/labs/{status['lab']}").json()["title"] == SAMPLE["title"]
    assert any(item["id"] == status["lab"] for item in client.get("/api/labs").json())
    # the same lesson again: its lab is reused, Muse Spark is not asked twice
    with LESSON_PDF.open("rb") as pdf:
        again = wait(client, client.post("/api/labs", files={"file": ("lecon.pdf", pdf, "application/pdf")}, data={"level": "4e"}).json()["job"])
    assert again["lab"] == status["lab"] and len(calls) == 1


def test_short_lessons_and_bad_ids_are_refused():
    client = TestClient(server.app)
    assert client.post("/api/labs", data={"text": "trop court"}).status_code == 400
    assert client.get("/api/labs/../../etc").status_code == 404
    assert client.get("/api/labs/sample-ohm-fr").json()["origin"] == "sample"


def test_the_tutor_sees_the_lesson_and_the_circuit(monkeypatch):
    seen = {}

    class Fake:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    seen.update(kw)
                    msg = type("M", (), {"content": "Regarde l'ampèremètre : que lis-tu ?"})
                    return type("R", (), {"choices": [type("C", (), {"message": msg})]})

    monkeypatch.setattr(tutor, "_client", lambda cfg, planner=False: Fake)
    client = TestClient(server.app)
    context = {"parts": [{"id": "R1", "voltage_V": 6.0, "current_A": 0.06}]}
    r = client.post("/api/labs/sample-ohm-fr/tutor", json={"question": "Pourquoi 60 mA ?", "history": [], "context": context})
    assert r.json()["answer"].startswith("Regarde")
    assert "0.06" in seen["messages"][-1]["content"] and "Ohm" in seen["messages"][1]["content"]


def test_the_tutor_sees_the_bench(monkeypatch):
    seen = {}

    class Fake:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    seen.update(kw)
                    msg = type("M", (), {"content": "Je vois L1 allumée."})
                    return type("R", (), {"choices": [type("C", (), {"message": msg})]})

    monkeypatch.setattr(tutor, "_client", lambda cfg, planner=False: Fake)
    client = TestClient(server.app)
    picture = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    r = client.post("/api/labs/sample-lampes-fr/tutor", json={"question": "Tu vois quoi ?", "image": picture})
    assert r.status_code == 200
    content = seen["messages"][-1]["content"]
    assert content[0]["type"] == "text" and content[1]["image_url"]["url"] == picture
    assert client.post("/api/labs/sample-lampes-fr/tutor", json={"question": "?", "image": "javascript:alert(1)"}).status_code == 400


def test_the_tutor_without_a_key_says_so(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("PLANNER_BASE_URL", raising=False)
    r = TestClient(server.app).post("/api/labs/sample-ohm-fr/tutor", json={"question": "?"})
    assert r.status_code == 503 and "MODEL_API_KEY" in r.json()["detail"]


def test_pages_and_old_links():
    client = TestClient(server.app, follow_redirects=False)
    assert client.get("/samples/ohm_fr.lab.json").status_code == 200
    old = client.get("/lab.html?lab=sample-ohm-en")  # links shared before the Next.js app
    assert old.status_code == 301 and old.headers["location"] == "/lab?lab=sample-ohm-en"
    assert client.get("/replay.html?session=abc").headers["location"] == "/replay?session=abc"
    assert client.get("/secret.html").status_code == 404
    home = client.get("/")
    if (server.WEB / "index.html").exists():  # built: the static Next.js export is served
        assert home.status_code == 200 and "TimaLens" in home.text
        assert client.get("/lab").status_code == 200 and client.get("/replay").status_code == 200
        assert client.get("/img/timalens-logo.png").headers["content-type"] == "image/png"
    else:
        assert home.status_code == 503 and "make build" in home.text


# ---------------------------------------------------------------- sessions, video, 3D
SESSION = {"version": 1, "lab": "sample-ohm-fr", "events": [
    {"t": 0, "kind": "circuit", "components": [{"id": "B1", "type": "battery", "a": [1, 4], "b": [1, 3], "V": 6}]},
    {"t": 3.2, "kind": "measure", "part": "R1", "U": 6, "I": 0.06},
], "summary": {"measures": 1}}


def test_a_session_is_saved_and_replayed():
    client = TestClient(server.app)
    saved = client.post("/api/labs/sample-ohm-fr/sessions", json=SESSION)
    assert saved.status_code == 200
    back = client.get(f"/api/sessions/{saved.json()['id']}").json()
    assert back["session"]["events"][1]["U"] == 6 and back["lab"]["title"] == SAMPLE["title"]


def test_bad_sessions_are_refused():
    client = TestClient(server.app)
    assert client.post("/api/labs/sample-ohm-fr/sessions", json={"events": [{"kind": "rm -rf"}]}).status_code == 400
    assert client.post("/api/labs/sample-ohm-fr/sessions", content=b"not json").status_code == 400
    assert client.post("/api/labs/no-such-lab/sessions", json=SESSION).status_code == 404
    assert client.get("/api/sessions/../../etc").status_code == 404


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_webm_becomes_h264_mp4(tmp_path):
    import subprocess

    webm = tmp_path / "clip.webm"
    subprocess.run([settings().ffmpeg, "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10", "-t", "1", "-c:v", "libvpx", str(webm)], check=True)
    r = TestClient(server.app).post("/api/video/mp4", content=webm.read_bytes())
    assert r.status_code == 200 and r.headers["content-type"] == "video/mp4"
    out = tmp_path / "out.mp4"
    out.write_bytes(r.content)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(out)], capture_output=True, text=True)
    assert probe.stdout.strip() == "h264"


def test_the_teacher_can_ask_for_3d(monkeypatch):
    asked = []
    monkeypatch.setattr(generate, "chat_json", lambda cfg, messages, **k: asked.append(messages) or copy.deepcopy(SAMPLE))
    lab = generate.lab_from_lesson(settings(), "La loi d'Ohm " * 40, view="3d")
    assert lab["view"] == "3d" and '"view": "3d"' in asked[0][1]["content"]


def test_the_3d_sample_is_listed_and_valid():
    client = TestClient(server.app)
    assert any(item["id"] == "sample-lampes-fr" for item in client.get("/api/labs").json())
    lab = client.get("/api/labs/sample-lampes-fr").json()
    assert lab["view"] == "3d" and generate.check(lab, settings().node) == []


# ---------------------------------------------------------------- languages
EN = json.loads((ROOT / "samples" / "ohm_en.lab.json").read_text())


def test_every_sample_comes_in_french_and_english():
    client = TestClient(server.app)
    for key in ("sample-ohm", "sample-lampes"):
        fr, en = client.get(f"/api/labs/{key}-fr").json(), client.get(f"/api/labs/{key}-en").json()
        assert fr["language"] == "fr" and en["language"] == "en"
        assert fr["translations"] == en["translations"] == {"fr": f"{key}-fr", "en": f"{key}-en"}
        assert generate.skeleton(fr) == generate.skeleton(en)  # the same lab, in other words
    assert {item["id"] for item in client.get("/api/labs?lang=en").json()} >= {"sample-ohm-en", "sample-lampes-en"}
    assert not any(item["id"].endswith("-fr") for item in client.get("/api/labs?lang=en").json() if item["origin"] == "sample")


def test_a_translation_that_changes_the_lab_is_sent_back(monkeypatch):
    cheat = copy.deepcopy(EN)
    cheat["quiz"][0]["answer"] = 2  # a "translation" that moves the right answer
    replies = [cheat, copy.deepcopy(EN)]
    asked = []
    monkeypatch.setattr(generate, "chat_json", lambda cfg, messages, **k: asked.append(copy.deepcopy(messages)) or replies.pop(0))
    out = generate.translate_lab(settings(), SAMPLE, "en")
    assert out["language"] == "en" and out["quiz"][0]["answer"] == SAMPLE["quiz"][0]["answer"]
    assert "quiz[0].answer" in asked[1][-1]["content"]


def test_translate_a_generated_lab_once(monkeypatch):
    monkeypatch.setattr(generate, "chat_json", lambda cfg, messages, **k: copy.deepcopy(SAMPLE))
    client = TestClient(server.app)
    job = client.post("/api/labs", data={"text": "La loi d'Ohm. " * 30}).json()["job"]
    lab_id = wait(client, job)["lab"]
    calls = []
    monkeypatch.setattr(generate, "translate_lab", lambda cfg, lab, language: calls.append(language) or copy.deepcopy(EN))
    first = client.post(f"/api/labs/{lab_id}/translate", json={"language": "en"}).json()["id"]
    again = client.post(f"/api/labs/{lab_id}/translate", json={"language": "en"}).json()["id"]
    assert first == again and calls == ["en"]  # made once, then reused
    assert client.get(f"/api/labs/{first}").json()["title"] == EN["title"]
    assert client.get(f"/api/labs/{lab_id}").json()["translations"] == {"fr": lab_id, "en": first}
    assert client.get(f"/api/labs/{first}").json()["translations"]["fr"] == lab_id
    listed = client.get("/api/labs?lang=en").json()
    assert any(item["id"] == first for item in listed) and not any(item["id"] == lab_id for item in listed)
    assert client.post("/api/labs/sample-ohm-fr/translate", json={"language": "wolof"}).status_code == 400


def test_the_tutor_answers_in_the_students_language(monkeypatch):
    seen = {}

    class Fake:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    seen.update(kw)
                    msg = type("M", (), {"content": "Look at the ammeter."})
                    return type("R", (), {"choices": [type("C", (), {"message": msg})]})

    monkeypatch.setattr(tutor, "_client", lambda cfg, planner=False: Fake)
    TestClient(server.app).post("/api/labs/sample-ohm-fr/tutor", json={"question": "Why?", "language": "en"})
    assert any(m["role"] == "developer" and "Answer in English" in m["content"] for m in seen["messages"])


# ---------------------------------------------------------------- Tima's live voice
def test_the_tutor_streams_its_answer(monkeypatch):
    def chunk(text):
        delta = type("D", (), {"content": text})
        return type("K", (), {"choices": [type("C", (), {"delta": delta})]})

    class Fake:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    assert kw["stream"] is True
                    return iter([chunk("Regarde L1. "), chunk("Que vois-tu ?")])

    monkeypatch.setattr(tutor, "_client", lambda cfg, planner=False: Fake)
    r = TestClient(server.app).post("/api/labs/sample-lampes-fr/tutor/stream", json={"question": "Pourquoi ?"})
    events = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    assert "".join(e.get("delta", "") for e in events) == "Regarde L1. Que vois-tu ?" and events[-1] == {"done": True}


def test_the_streaming_tutor_without_a_key_says_so(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("PLANNER_BASE_URL", raising=False)
    assert TestClient(server.app).post("/api/labs/sample-ohm-fr/tutor/stream", json={"question": "?"}).status_code == 503


def test_without_a_voice_key_the_browser_speaks(monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    client = TestClient(server.app)
    assert client.get("/api/health").json()["voice"] == "browser"
    assert client.post("/api/tts", json={"text": "Bonjour"}).status_code == 503


def test_tima_speaks_with_voxtral(monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "test-key")
    async def speak(cfg, text, language):
        return b"ID3-mp3:" + text.encode()

    monkeypatch.setattr(voice, "speak", speak)
    r = TestClient(server.app).post("/api/tts", json={"text": "Bravo !", "language": "fr"})
    assert r.headers["content-type"] == "audio/mpeg" and r.content.endswith(b"Bravo !")


def test_the_live_ears_relay_audio_and_transcripts(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-key")
    sent = []

    class FakeMeta:  # Muse Voice Transcribe's realtime endpoint, as the relay sees it
        def __init__(self):
            self.events = [{"sessionId": "s1"}]
            self.spoken = asyncio.Event()

        async def send(self, data):
            sent.append(data)
            if isinstance(data, bytes):  # audio in: the student speaks
                self.events += [{"type": "speechStart", "turnId": "t1"}, {"type": "transcript", "turnId": "t1", "transcript": "hey Tima"},
                                {"type": "speechComplete", "turnId": "t1", "transcript": "hey Tima pourquoi"}]
                self.spoken.set()

        async def recv(self):
            return json.dumps(self.events.pop(0))

        def __aiter__(self):
            return self

        async def __anext__(self):
            while not self.events:
                self.spoken.clear()
                await self.spoken.wait()
            return json.dumps(self.events.pop(0))

        async def close(self):
            pass

    async def connect(cfg):
        return FakeMeta()

    monkeypatch.setattr(voice, "connect", connect)
    with TestClient(server.app).websocket_connect("/api/live") as ws:
        ws.send_json({"language": "fr"})
        assert ws.receive_json() == {"type": "ready"}
        ws.send_bytes(b"\x00\x00" * 1920)
        events = [ws.receive_json() for _ in range(3)]
        ws.send_text('{"type": "stop"}')
    handshake = json.loads(sent[0])
    assert handshake["audioEncoding"] == "PCM_24KHZ" and handshake["authorization"]["accessToken"] == "Bearer test-key" and "Tima" in handshake["keywords"]
    assert handshake["languageBias"][0] == "French" and isinstance(sent[1], bytes)
    assert events[-1] == {"type": "speechComplete", "turnId": "t1", "transcript": "hey Tima pourquoi"}


def test_the_live_ears_need_a_key(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    with TestClient(server.app).websocket_connect("/api/live") as ws:
        ws.send_json({"language": "en"})
        assert ws.receive_json()["type"] == "error"


# ---------------------------------------------------------------- Tima while the lab is made
def test_the_job_tells_its_story_and_keeps_the_lesson_private(monkeypatch):
    lab = copy.deepcopy(SAMPLE)
    monkeypatch.setattr(generate, "chat_json", lambda cfg, messages, **kw: lab)
    client = TestClient(server.app)
    job = client.post("/api/labs", data={"text": "La loi d'Ohm\n" + "Une résistance freine le courant. " * 20}).json()["job"]
    for _ in range(200):
        status = client.get(f"/api/jobs/{job}").json()
        if status["stage"] in ("ready", "failed"):
            break
        time.sleep(0.05)
    kinds = [e["kind"] for e in status["events"]]
    assert kinds == ["reading", "read", "designing", "designed", "checking", "checked", "ready"], kinds
    read = status["events"][1]
    assert read["title"] == "La loi d'Ohm" and read["words"] > 100
    assert status["events"][3]["challenges"] == len(SAMPLE["challenges"])
    assert "lesson" not in status  # the lesson is not sent back on every poll


def test_the_teacher_can_ask_tima_while_waiting(monkeypatch):
    seen = {}

    class Fake:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    seen.update(kw)
                    msg = type("M", (), {"content": "Ton cours insiste sur U = R × I."})
                    return type("R", (), {"choices": [type("C", (), {"message": msg})]})

    monkeypatch.setattr(tutor, "_client", lambda cfg, planner=False: Fake)
    server.jobs["j1"] = {"stage": "designing", "events": [], "lesson": "La loi d'Ohm : U = R × I.", "draft": {"title": "Ohm"}}
    r = TestClient(server.app).post("/api/jobs/j1/ask", json={"question": "Sur quoi insiste mon cours ?", "language": "fr"})
    assert r.json()["answer"].startswith("Ton cours")
    assert "U = R × I" in seen["messages"][1]["content"] and "designing" in seen["messages"][2]["content"]
    assert TestClient(server.app).post("/api/jobs/nope/ask", json={"question": "?"}).status_code == 404


def test_an_unreachable_meta_is_said_plainly(monkeypatch):
    import httpx
    import openai

    class Fake:
        class chat:
            class completions:
                @staticmethod
                def create(**kw):
                    raise openai.APITimeoutError(request=httpx.Request("POST", "https://api.meta.ai/v1/chat/completions"))

    monkeypatch.setattr(tutor, "_client", lambda cfg, planner=False: Fake)
    monkeypatch.setattr(server, "reachable", lambda host, port=443: False)
    client = TestClient(server.app)
    assert client.get("/api/health").json()["meta_reachable"] is False
    r = client.post("/api/labs/sample-ohm-en/tutor", json={"question": "?"})
    assert r.status_code == 503 and "cannot be reached from this network" in r.json()["detail"]


def test_a_sentence_voxtral_refuses_is_a_one_off(monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "test-key")

    async def speak(cfg, text, language):
        raise voice.VoiceError("Voxtral TTS answered 403")

    monkeypatch.setattr(voice, "speak", speak)
    r = TestClient(server.app).post("/api/tts", json={"text": "Bonjour"})
    assert r.status_code == 502  # not 503: the browser keeps Voxtral for the next sentences

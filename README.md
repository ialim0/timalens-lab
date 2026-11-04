<p><img src="frontend/public/img/timalens-logo.png" alt="TimaLens" height="40"></p>

# TimaLens Lab

[![CI](https://github.com/ialim0/timalens-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/ialim0/timalens-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)
![Built with Meta Muse Spark](https://img.shields.io/badge/Meta-Muse%20Spark%201.3-0467DF)

**From watching a lesson to experiencing it.** · [Lire en français](README.fr.md) · [Demo script](docs/DEMO.md)

> Built for the Meta AI Global Hackathon.

A teacher uploads a lesson on electric circuits: a PDF, a Word or PowerPoint file, a photo of the blackboard or a notebook page, or a recording of the class. A minute later they have an interactive lab to share with their students as a single link. In the lab, students:

- build real DC circuits and change them;
- read the meters;
- plot U(I);
- solve challenges;
- ask a tutor that knows the lesson and sees their circuit;
- switch between the **2D schematic** and a **3D lab bench** with real-looking parts;
- at the end, **download an MP4 video of their own lab** or save it as a link the teacher can replay.

The lab works on a low-end phone and survives a bad connection.

## Why it is different

PhET-style simulators are excellent, but generic: the same lab for every class. TimaLens Lab builds the lab **from the teacher's own lesson**. It keeps:

- the lesson's notation (U or V) and its level;
- its worked examples;
- the mistakes it warns about.

The tutor answers from that lesson, using the numbers of the student's own circuit.

## How it works

```
 lesson (PDF · DOCX · PPTX · photo · audio/video)
   │  pypdf / python-docx / python-pptx
   │  Muse Spark vision ........... photos, scanned PDFs
   │  Muse Voice Transcribe ....... recorded lessons
   ▼
 Muse Spark 1.3 (structured output) ── designs the lab as JSON:
   │   presets, guided activities (predict → do/measure → observe),
   │   challenges with goals, quiz, formulas, misconceptions
   ▼
 the circuit engine checks it (frontend/src/lab/labcheck.js, run with Node)
   │   lays out and solves every preset, and searches the controls the student
   │   may touch to prove every challenge is achievable (and not already solved)
   │   └── problems go back to Muse Spark in plain words (up to 3 rounds)
   ▼
 the lab (the Next.js app, /lab): the same engine, in the browser
   └── tutor: Muse Spark, grounded in the lesson + the solved circuit
       voice questions: Muse Voice Transcribe · answers read aloud by the browser
```

## Tima, the voice guide

Students who have never seen a lab need someone beside them. **Tima** is a glowing orb on the bench that talks:

- **She explains.** One tap opens the lab, the camera flies down onto the bench, and Tima says what the lab is about and what its missions are. She reads each step aloud.
- **She reacts** to what the circuit does: a bulb lighting up, a short circuit, a burnt LED, a challenge met (with confetti). If a student is stuck on a challenge, she offers its hint.
- **She listens, live.** The microphone streams to **Muse Voice Transcribe realtime** (through the server, which keeps the key): the words appear as they are said, Meta detects the end of the sentence, and her name is a recognition keyword. Say **"Hey Tima"**, or tap the orb. After she answers, she keeps listening a few seconds, so the student can simply reply. Without a key, the browser's own recognition stands in.
- **She answers as she thinks.** Muse Spark's answer streams in, and each finished sentence is spoken at once with **Voxtral** (Mistral's voice, when `MISTRAL_API_KEY` is set; else the browser's). The orb moves with her voice, and "Hey Tima" interrupts her.
- **She sees.** Every question carries a picture of the bench, the 3D table or the schematic, to **Muse Spark's vision**, alongside the engine's numbers, so she can say what the student actually built. The **Look** button asks her what she sees and what to try next. While she talks about a part ("look at L1"), it glows on the bench.
- **She never invents a number.** What she says about the circuit comes from the engine; answers come from the grounded tutor. She speaks with the browser's own voices, so she is free and works offline once the page is loaded. Mute her and her words stay as captions.

The bench is hands-on: **drag a part from the tray onto the bench**, in 2D or 3D; a glowing beam shows where it will land. Pick a placed part up to move it, or drop it off the bench to take it away; the circuit is re-solved the moment it leaves or lands. Measurements take themselves: change a value and each new reading becomes a point of the U(I) graph. On a **Meta Quest**, the **VR** button puts the bench in front of the student (WebXR).

## One engine, three views

The 2D schematic, the 3D bench and the video are three renderings of **the same solved circuit**. None of them simulates anything on its own.

- **2D** (`frontend/src/lab/board.js`): the French school symbols, with moving charges whose speed follows the current on a log scale.
- **3D** (`frontend/src/lab/bench3d.js`, three.js, loaded only on demand):
  - resistors wear their **real colour code**, computed from their value (470 Ω → yellow, violet, brown, gold);
  - bulbs glow with the **engine's brightness**, P / P rated: dim in series, full in parallel;
  - LEDs light only forward-biased, and burn out with smoke above their current limit;
  - multimeters show the **computed reading** on their screen;
  - the student turns the bench with a finger and taps a part to adjust it.

  Muse Spark chooses the view that opens from the lesson: 3D for real apparatus and hands-on building, 2D for diagram work. The teacher can override it, and the student can always switch.
- **Video** (`frontend/src/lab/video.js`).
  - **Recording.** Every session is recorded as an event log of a few KB (`frontend/src/lab/session.js`): each circuit change (one per quarter second while a slider moves), each prediction, measurement, challenge met, tutor exchange and quiz answer.
  - **Rendering.** The video is computed from that log frame by frame. Each frame re-solves the circuit with the same engine and draws it with the same 2D or 3D code, with captions, the live meter readings, the U(I) graph building up, and a final lab report.
  - **Encoding.** Frames are encoded with WebCodecs to an H.264 MP4 that plays in WhatsApp. Browsers without WebCodecs fall back to MediaRecorder, and the server converts that recording to H.264 with ffmpeg.
  - **Why from a log.** A replay is exact. A phone on 2G sends 5 KB instead of 10 MB. A teacher can re-render any student's lab in 2D or 3D from `/replay?session=…`.

**The model configures the lab; it never computes the physics.** Every voltage, current and brightness comes from `frontend/src/lab/circuit.js`, a deterministic solver:

- modified nodal analysis;
- batteries with internal resistance;
- a piecewise LED model with iteration;
- bulbs with brightness and burnout;
- short-circuit detection.

The engine is tested against hand-worked answers. The same file runs in the student's browser and on the server's checker, so what the checker proved is exactly what the student gets.

## Meta models used

| Model | Where | What for |
|---|---|---|
| `muse-spark-1.3` | `app/generate.py` | Designs the lab from the whole lesson, with JSON-schema structured output. Repairs it from the engine's feedback. |
| `muse-spark-1.3` (vision) | `app/tutor.py` | Tima, the voice tutor: grounded in the lesson and the live, solved circuit, and looking at a picture of the student's bench. |
| `muse-spark-1.3` (vision) | `app/meta.py` `read_pages` | Reads photographed or scanned lessons: blackboards, notebooks, textbook pages, including circuit diagrams. |
| `muse-spark-1.3` | `app/generate.py` `translate_lab` | Translates a lab (French ⇄ English, or a lab's content into Wolof, Hausa, Yorùbá, Fɔngbè, Kiswahili, Bamanankan). The structure must come back identical (ids, values, goals, answer indexes) and the engine re-checks it, so a translation can never change the physics or move a quiz answer. |
| `muse-voice-transcribe-1.0` (realtime) | `app/voice.py` `relay` | Tima's ears: streaming transcription with endpointing, and "Tima" as a keyword. |
| `muse-voice-transcribe-1.0` | `app/meta.py` `transcribe` | Turns recorded lessons into text. |

**Open weights.** Set `PLANNER_BASE_URL` to point both the designer and the tutor at any OpenAI-compatible server, for example vLLM serving an open-weight Muse model. A school or ministry can then run the whole thing on its own hardware.

## Built for African classrooms

- **Light.** The web app is a static Next.js export: about 170 KB gzipped for the lab in 2D, React included, cached for good after the first visit. three.js loads only when a student opens the 3D view, and the MP4 muxer only when they make a video. A lab is a few KB of JSON, and so is a whole recorded session.
- **Works offline once loaded.** The engine runs in the browser. With no connection, the tutor falls back on what the engine knows: the readings, U/I for each part, the challenge's hint and the lesson's formula.
- **French and English.**
  - Every page has a FR | EN switch. The choice is remembered, and the browser's language is the default.
  - The sample labs exist in both languages, with the same structure.
  - An English visitor who opens a French link gets the English version.
  - A generated lab is translated once by Muse Spark, on request, then kept.
  - The tutor answers in the student's language, whatever the lesson's.
  - The video's captions are in the same language.
- **Local languages.** The teacher can ask for the lab's content in Wolof, Hausa, Yorùbá, Fɔngbè, Kiswahili or Bamanankan; the interface stays in French or English.
- **Shareable.** One link, with a WhatsApp button.
- **Paper lessons count.** A photo of the blackboard is a valid upload.
- **Retries are free.** The same lesson uploaded twice reuses its lab instead of calling the model again.

## Quick start

**With Docker** (nothing else to install):

```bash
cp .env.example .env        # add MODEL_API_KEY from the Meta Model API dashboard; never commit it
docker compose up --build   # http://localhost:8080
```

**Without Docker** (Python 3.10+, Node 20+, ffmpeg):

```bash
make install                # the server (virtualenv) and the web app (npm)
cp .env.example .env        # add MODEL_API_KEY (and MISTRAL_API_KEY for Tima's Voxtral voice)
make dev                    # the API on :8080 and the web app on http://localhost:3000, hot reload
```

`make serve` builds the web app and runs everything as in production on http://localhost:8080.

No key yet? The two hand-written sample labs work without one:

- `/lab?lab=sample-ohm-en` (or `-fr`): Ohm's law and the LED, opens in 2D;
- `/lab?lab=sample-lampes-en` (or `-fr`): bulbs in series and in parallel, and the junction rule, opens in 3D.

Add `&lang=en` or `&lang=fr` to any page's address to choose the interface's language. To try
an upload, use `samples/lecon_loi_ohm.pdf`, a 4e lesson on Ohm's law (rebuild it with
`tools/make_sample_lesson.py`).

## Deploy to the cloud

The repo ships Terraform for **Google Cloud Run**: Artifact Registry, a versioned GCS bucket
for the labs, Secret Manager for the key, a least-privilege service account. One command
builds the image with Cloud Build and deploys it:

```bash
export TF_VAR_model_api_key=...
make deploy PROJECT=my-gcp-project
```

See [infra/README.md](infra/README.md) for the settings, limits and costs. The image also runs
unchanged on any container host: it listens on `$PORT` and stores its data in `/app/data`.

## Configuration

Settings are read from the environment (see [.env.example](.env.example)):

| Variable | Purpose | Default |
|---|---|---|
| `MODEL_API_KEY` | Meta Model API key | — |
| `META_BASE_URL` | Meta Model API base URL | `https://api.meta.ai/v1` |
| `PLANNER_MODEL` | Model that designs the lab and tutors | `muse-spark-1.3` |
| `PLANNER_EFFORT` | Reasoning effort for the design | `medium` |
| `ASR_MODEL` | Speech-to-text model | `muse-voice-transcribe-1.0` |
| `PLANNER_BASE_URL`, `PLANNER_API_KEY` | Open-weight server (optional) | — |
| `MISTRAL_API_KEY` | Tima's voice (Voxtral TTS); without it the browser's voice speaks | — |
| `TTS_VOICE_FR`, `TTS_VOICE_EN` | Voxtral voice per language | picked automatically |
| `DATA_DIR` | Where generated labs and saved sessions are stored | `./data` |

## Development

```bash
make help            # every task
make test            # engine, checker, sessions, video timeline (Node) + server (pytest, offline)
make e2e             # the whole app in Chrome (Playwright): pages, drag and drop, Tima, replay
make lint            # ruff + TypeScript + terraform fmt
make check-samples   # run the lab checker on every sample
node tools/check_lab.mjs path/to/lab.json   # check any lab file
```

No test needs a key or calls a model: the Python tests fake Muse Spark and Meta's realtime ears,
and the end-to-end tests stand in for the tutor and the microphone. CI (GitHub Actions) runs all
of them, builds and smoke-tests the Docker image, and validates the Terraform.

## Project layout

```
app/          FastAPI server: Meta model calls, lesson reading, lab design loop, tutor, Tima's voice
frontend/     the web app (Next.js, exported as static files the server serves)
  src/app/    the pages: / (teacher), /lab (student), /replay (a saved session's video)
  src/components/  React: the teacher's page, the lab's layout, the replay
  src/lab/    circuit.js (engine) · labcheck.js (checker) · board.js (2D) · bench3d.js (3D)
              tima.js + voice.js (Tima) · session.js (event log) · video.js (frames → MP4) · lab.js (the bench)
  e2e/        Playwright tests
samples/      two hand-written labs, each in French and English, and a lesson PDF to upload
tools/        check_lab.mjs (the checker as a CLI), make_sample_lesson.py
tests/        Node and pytest suites
infra/        Terraform for Google Cloud Run
scripts/      deploy.sh
docs/         DEMO.md, the 3-minute hackathon demo script
```

## Contributing

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).

# TimaLens Lab · Meta Global AI Developer Hackathon

**Track:** Indie developer · **Theme:** Build for Your World

> From watching a lesson to experiencing it.

## The problem I know firsthand

I taught mathematics in a village in Benin with no electricity. My students learned about
circuits from a blackboard drawing: they had never closed a switch and watched a bulb light.
Most schools in Africa have no physics lab, and the generic simulators that exist teach someone
else's lesson, in someone else's words.

## What TimaLens Lab does

A teacher uploads **their own lesson**: a PDF, a Word or PowerPoint file, a photo of the
blackboard, or a recording of the class. A minute later the class has an interactive lab, shared
as one link (or on WhatsApp), that works on a $50 phone.

- **Tima, a voice guide, stays with the teacher while the lab is made.** She narrates what is
  really happening, including **Muse Spark's own reasoning, read aloud** as it designs the lab;
  she answers the teacher's questions about their lesson in the meantime, and opens the lab
  when it is ready.
- **Students build real DC circuits** by dragging parts onto a bench, in 2D or in an immersive
  3D world (and in **VR on a Meta Quest**). Bulbs glow with the right brightness, LEDs burn out
  with sparks, meters show real readings.
- **Students can drive the lab with their hands.** With the ✋ button, the webcam tracks the
  hand **in the browser** (MediaPipe: the video never leaves the computer): pinch to grab a part
  and drop it on the bench, open the hand to turn the 3D bench, make a fist to talk to Tima.
  Hands and voice together: no mouse, no keyboard.
- **Tima guides each student by voice**: she explains the missions, reacts to what the circuit
  does, wakes on "Hey Tima", **looks at the student's bench** before answering, and lights up
  the parts she is talking about.
- **The AI never computes the physics.** A deterministic circuit engine (modified nodal
  analysis) solves every circuit and **proves every challenge can be met** before a student sees
  it. Anything wrong goes back to Muse Spark in plain words.

## Meta models, and what each one does

| Model | Job |
|---|---|
| **Muse Spark 1.3** (or **Muse Wonder**) | Designs the lab from the whole lesson on the **Responses API**: structured output, **streamed reasoning summaries** that Tima reads to the teacher, and repairs from the engine's feedback |
| **Muse Spark vision** | Reads photographed lessons (blackboards, notebooks), and **sees the student's bench** (a picture of the 2D board or the 3D table) when they ask Tima a question |
| **Muse Spark** (Contributor mode possible) | Tima, the Socratic tutor: grounded in the lesson and the live, solved circuit; answers stream sentence by sentence |
| **Muse Voice Transcribe (realtime)** | Tima's ears: streaming transcription with endpointing over WebSocket, "Tima" as a recognition keyword, French/English code-switching |
| **Muse Voice Transcribe** | Turns recorded lessons into text |
| **Muse Image** | Draws each lab's cover while the engine checks it |
| **Muse Spark Open** (optional) | `PLANNER_BASE_URL` points the designer and the tutor at any OpenAI-compatible server (a hosted partner or a school's own GPUs) |

Tima's voice out loud is Voxtral (Mistral), because Muse Voice Transcribe is speech-to-text only;
without a key, the browser's own voice speaks.

## Technical depth

- A **circuit engine** shared by the browser, the server's checker, the 3D bench and the video
  renderer: modified nodal analysis, batteries with internal resistance, a piecewise LED model,
  bulbs with brightness and burnout, short-circuit detection, tested against hand-worked answers.
- An **achievability search** that proves every challenge is solvable with the controls the
  student may touch, and rejects challenges already solved.
- A **generate → check → repair loop** with Muse Spark, narrated live.
- **Tima**: realtime ears relayed through the server (the key never reaches the browser), a
  wake word robust to recogniser spellings and to her own voice, streamed answers spoken while
  they are written, follow-up replies without her name, barge-in.
- **Deterministic video**: every session is a few-KB event log; the MP4 is recomputed frame by
  frame by the same engine (WebCodecs), so a teacher on 2G can receive a student's lab.
- **Built to ship**: Next.js static export served by FastAPI in one container, Terraform for
  Google Cloud Run (Secret Manager, a least-privilege service account, a GCS volume), GitHub
  Actions running **22 end-to-end tests in Chrome** (including hand tracking), 37 server tests and 25 engine tests.
- **Hands as a pointer**: gestures (pinch, open hand, fist) classified from MediaPipe's 21 landmarks,
  scale-invariant, with hysteresis; they become the same pointer events a mouse makes, so every
  interaction of the lab works by hand without a second code path.

## Try it

- **Live:** _the Cloud Run URL_ (sample labs need nothing; uploading a lesson calls Meta's models)
- **Sample labs, no key needed:** `/lab?lab=sample-lampes-en` (3D) · `/lab?lab=sample-ohm-en` (2D)
- **Run it:** `cp .env.example .env` (add `MODEL_API_KEY`), then `make dev` and open http://localhost:3000
- **Code:** https://github.com/ialim0/timalens-lab · **Demo script:** [docs/DEMO.md](docs/DEMO.md)

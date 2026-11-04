# Contributing to TimaLens Lab

Thank you for helping students who have no physics lab. Bug reports, new sample labs,
translations and code are all welcome.

## Set up

You need Python 3.10+, Node 20+ and ffmpeg (Docker works too, see the README).

```bash
make install            # the server (virtualenv) and the web app (npm)
cp .env.example .env    # add your MODEL_API_KEY (only needed to generate labs and use the tutor)
make dev                # the API on :8080, the web app on http://localhost:3000
```

The sample labs (`/lab?lab=sample-ohm-en`) work without a key.

## Before you open a pull request

```bash
make test    # Node engine tests + Python server tests (offline: the models are faked)
make e2e     # the whole app in Chrome (Playwright)
make lint    # ruff + TypeScript + terraform fmt
```

- Keep a pull request to one change, and explain the classroom problem it solves.
- Add a test for new behaviour. The engine is tested against hand-worked answers in
  `tests/circuit.test.mjs`; the backend fakes Muse Spark in `tests/test_backend.py`.
- Any text the user sees must exist in French **and** English (`frontend/src/lab/i18n.js`).

## Ground rules of the design

1. **The model configures, the engine computes.** Every voltage, current and brightness
   comes from `frontend/src/lab/circuit.js`. Never let a model's number reach the student.
2. **One engine everywhere.** The browser, the server's checker (`tools/check_lab.mjs`), the
   3D bench and the video renderer share the same file. Don't fork the physics.
3. **Light by default.** The pages are React (Next.js, exported as static files); the bench
   stays plain modules in `frontend/src/lab/`. Anything heavy (three.js, the MP4 muxer) is
   loaded only when a student asks for it. The lab must run on a low-end phone with a bad connection.
4. **Secrets stay on the server.** The browser never sees `MODEL_API_KEY`.

## Style

- Python: `ruff` (config in `pyproject.toml`), type hints, docstrings that say *why*.
- TypeScript for React components; the engine and the bench are plain ES modules (shared with
  the server's checker and the Node tests).
- Terraform: `terraform fmt`, one concern per block, comments for anything non-obvious.
- Commits: short imperative subject (`Add bulb burnout to the 3D bench`).

## Code of conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

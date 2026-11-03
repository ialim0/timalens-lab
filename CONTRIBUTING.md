# Contributing to TimaLens Lab

Thank you for helping students who have no physics lab. Bug reports, new sample labs,
translations and code are all welcome.

## Set up

You need Python 3.10+, Node 18+ and ffmpeg (Docker works too, see the README).

```bash
make install            # virtualenv + the app + dev tools
cp .env.example .env    # add your MODEL_API_KEY (only needed to generate labs and use the tutor)
make dev                # http://localhost:8080
```

The sample labs (`/lab.html?lab=sample-ohm-en`) work without a key.

## Before you open a pull request

```bash
make test    # Node engine tests + Python backend tests (offline: the models are faked)
make lint    # ruff + terraform fmt
```

- Keep a pull request to one change, and explain the classroom problem it solves.
- Add a test for new behaviour. The engine is tested against hand-worked answers in
  `tests/circuit.test.mjs`; the backend fakes Muse Spark in `tests/test_backend.py`.
- Any text the user sees must exist in French **and** English (`web/js/i18n.js`).

## Ground rules of the design

1. **The model configures, the engine computes.** Every voltage, current and brightness
   comes from `web/js/circuit.js`. Never let a model's number reach the student.
2. **One engine everywhere.** The browser, the server's checker (`tools/check_lab.mjs`), the
   3D bench and the video renderer share the same file. Don't fork the physics.
3. **Light by default.** No framework, no build step for `web/`. Anything heavy (three.js,
   the MP4 muxer) is loaded only when a student asks for it. The lab must run on a low-end
   phone with a bad connection.
4. **Secrets stay on the server.** The browser never sees `MODEL_API_KEY`.

## Style

- Python: `ruff` (config in `pyproject.toml`), type hints, docstrings that say *why*.
- JavaScript: plain ES modules, no dependencies outside `web/vendor/`.
- Terraform: `terraform fmt`, one concern per block, comments for anything non-obvious.
- Commits: short imperative subject (`Add bulb burnout to the 3D bench`).

## Code of conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

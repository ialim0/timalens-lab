"""Settings, read from the environment. Nothing secret is ever written to disk.

Meta's hosted models (api.meta.ai) need MODEL_API_KEY. The planner can instead run on an
open-weight model (Muse Spark Open, or Muse Glimmer) served behind any OpenAI-compatible
endpoint, such as vLLM: set PLANNER_BASE_URL (and PLANNER_API_KEY if it wants one).

Tima's live voice: Muse Voice Transcribe's realtime endpoint listens (same key), and Voxtral
TTS (Mistral) speaks when MISTRAL_API_KEY is set; without it, the browser's voice speaks.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # Meta Model API
    api_key: str = field(default_factory=lambda: _env("MODEL_API_KEY"))
    base_url: str = field(default_factory=lambda: _env("META_BASE_URL", "https://api.meta.ai/v1"))
    planner_model: str = field(default_factory=lambda: _env("PLANNER_MODEL", "muse-spark-1.3"))
    planner_effort: str = field(default_factory=lambda: _env("PLANNER_EFFORT", "medium"))
    # which Meta model does which job: Muse Wonder (muse-wonder-1.0) may design the labs, and a
    # Contributor-mode Muse Spark (muse-spark-1.3-contributor) may tutor, at a lower price
    design_model: str = field(default_factory=lambda: _env("DESIGN_MODEL") or _env("PLANNER_MODEL", "muse-spark-1.3"))
    tutor_model: str = field(default_factory=lambda: _env("TUTOR_MODEL") or _env("PLANNER_MODEL", "muse-spark-1.3"))
    asr_model: str = field(default_factory=lambda: _env("ASR_MODEL", "muse-voice-transcribe-1.0"))
    image_model: str = field(default_factory=lambda: _env("IMAGE_MODEL", "muse-image-1.0"))  # draws each lab's cover
    asr_realtime_url: str = field(default_factory=lambda: _env("ASR_REALTIME_URL", "wss://api.meta.ai/v1/asr/realtime"))
    # Tima's voice (Voxtral TTS); voices are picked per language, or set here
    tts_api_key: str = field(default_factory=lambda: _env("MISTRAL_API_KEY"))
    tts_base_url: str = field(default_factory=lambda: _env("TTS_BASE_URL", "https://api.mistral.ai/v1"))
    tts_model: str = field(default_factory=lambda: _env("TTS_MODEL", "voxtral-mini-tts-3-0"))
    tts_voice_fr: str = field(default_factory=lambda: _env("TTS_VOICE_FR"))
    tts_voice_en: str = field(default_factory=lambda: _env("TTS_VOICE_EN"))
    # Open weights: an OpenAI-compatible server for the planner (e.g. vLLM serving Muse Spark Open)
    planner_base_url: str = field(default_factory=lambda: _env("PLANNER_BASE_URL"))
    planner_api_key: str = field(default_factory=lambda: _env("PLANNER_API_KEY"))
    # Tools
    node: str = field(default_factory=lambda: _env("NODE", shutil.which("node") or "node"))
    ffmpeg: str = field(default_factory=lambda: _env("FFMPEG", shutil.which("ffmpeg") or "ffmpeg"))
    data_dir: Path = field(default_factory=lambda: Path(_env("DATA_DIR", str(ROOT / "data"))))

    @property
    def planner_is_open_weight(self) -> bool:
        return bool(self.planner_base_url)


def settings() -> Settings:
    return Settings()

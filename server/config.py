"""Runtime configuration for the civics interview API (env-driven)."""

from __future__ import annotations

import os

_HERE = os.path.dirname(os.path.abspath(__file__))


def _origins(raw: str) -> list[str]:
    return [o.strip() for o in raw.split(",") if o.strip()]


# LLM backend (reuses the user's local Ollama via llm_core)
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
GRADER_PROVIDER = os.getenv("GRADER_PROVIDER", "ollama")
GRADER_MODEL = os.getenv("GRADER_MODEL", "qwen3.5:9b")
GRADE_TIMEOUT = int(os.getenv("GRADE_TIMEOUT", "45"))
GRADE_MAX_TOKENS = int(os.getenv("GRADE_MAX_TOKENS", "300"))
GRADE_TEMPERATURE = float(os.getenv("GRADE_TEMPERATURE", "0.2"))

# Request hygiene
MAX_TRANSCRIPT_CHARS = int(os.getenv("MAX_TRANSCRIPT_CHARS", "600"))
MAX_ACCEPTED_ANSWERS = int(os.getenv("MAX_ACCEPTED_ANSWERS", "40"))

# CORS — the public site origin(s). Comma-separated.
ALLOWED_ORIGINS = _origins(
    os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
)

# Abuse guard
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "30"))

# TTS — Piper (preferred) with macOS `say` fallback
TTS_ENGINE = os.getenv("TTS_ENGINE", "piper")  # piper | say | auto
PIPER_VOICE = os.getenv(
    "PIPER_VOICE", os.path.join(_HERE, "voices", "en_US-lessac-medium.onnx")
)
TTS_TIMEOUT = int(os.getenv("TTS_TIMEOUT", "30"))

# STT (faster-whisper)
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base.en")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(12 * 1024 * 1024)))

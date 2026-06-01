"""Runtime configuration for the civics interview API (env-driven)."""

from __future__ import annotations

import os

_HERE = os.path.dirname(os.path.abspath(__file__))

# Load server/.env if present (so config works regardless of how uvicorn is launched).
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(_HERE, ".env"))
except ImportError:
    pass


def _origins(raw: str) -> list[str]:
    return [o.strip() for o in raw.split(",") if o.strip()]


# LLM backend. GRADER_PROVIDER selects the path in grader.py:
#   "ollama" → direct /api/chat (think=False)   — local, default
#   "mlx"    → direct OpenAI-compatible /v1/chat/completions on a local MLX server
#   anything else (gemini/gpt/claude/…) → shared llm_core
# Ollama and MLX are called directly (not via llm_core): the shared library has
# no MLX provider, and Ollama needs the think=False toggle llm_core can't set.
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
GRADER_PROVIDER = os.getenv("GRADER_PROVIDER", "ollama")
GRADER_MODEL = os.getenv("GRADER_MODEL", "qwen3.5:9b")
GRADE_TIMEOUT = int(os.getenv("GRADE_TIMEOUT", "45"))
GRADE_MAX_TOKENS = int(os.getenv("GRADE_MAX_TOKENS", "300"))
GRADE_TEMPERATURE = float(os.getenv("GRADE_TEMPERATURE", "0.2"))

# Local MLX server (used when GRADER_PROVIDER=mlx). OpenAI-compatible endpoint;
# either a base URL or a /v1 URL is accepted. Default port 8088 matches the
# com.astra.mlx-vlm LaunchAgent (see server/DEPLOY.md). MLX_API_KEY is optional
# (only needed if the server is secured behind a tunnel).
MLX_BASE_URL = os.getenv("MLX_BASE_URL", "http://localhost:8088")
MLX_API_KEY = os.getenv("MLX_API_KEY", "")

# Request hygiene
MAX_TRANSCRIPT_CHARS = int(os.getenv("MAX_TRANSCRIPT_CHARS", "600"))
MAX_ACCEPTED_ANSWERS = int(os.getenv("MAX_ACCEPTED_ANSWERS", "40"))

# CORS — the public site origin(s). Comma-separated.
ALLOWED_ORIGINS = _origins(
    os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
)

# Abuse guard
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "30"))
TRUST_PROXY_HEADERS = os.getenv("TRUST_PROXY_HEADERS", "0") == "1"
GRADE_CONCURRENCY = int(os.getenv("GRADE_CONCURRENCY", "1"))
TTS_CONCURRENCY = int(os.getenv("TTS_CONCURRENCY", "1"))
STT_CONCURRENCY = int(os.getenv("STT_CONCURRENCY", "1"))
LLM_GUARD_ENABLED = os.getenv("LLM_GUARD_ENABLED", "1") == "1"
LLM_GUARD_THRESHOLD = float(os.getenv("LLM_GUARD_THRESHOLD", "0.92"))

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

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

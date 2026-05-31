"""Text-to-speech for officer feedback. Piper (preferred) → macOS `say` fallback.

Returns 16-bit PCM WAV bytes, or None if no engine is available.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time

import config
from logutil import log


def _read_and_unlink(path: str) -> bytes | None:
    try:
        if os.path.exists(path) and os.path.getsize(path) > 44:  # >WAV header
            with open(path, "rb") as fh:
                return fh.read()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    return None


def _piper_wav(text: str) -> bytes | None:
    model = config.PIPER_VOICE
    if not model or not os.path.exists(model):
        return None
    fd, out = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "piper", "-m", model, "-f", out],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=config.TTS_TIMEOUT,
        )
        if proc.returncode != 0:
            return None
    except Exception:
        try:
            os.unlink(out)
        except OSError:
            pass
        return None
    return _read_and_unlink(out)


def _say_wav(text: str) -> bytes | None:
    """macOS fallback: say → AIFF → 16-bit WAV via afconvert."""
    fd, aiff = tempfile.mkstemp(suffix=".aiff")
    os.close(fd)
    wav = aiff[:-5] + ".wav"
    try:
        if subprocess.run(
            ["say", "-o", aiff, text], capture_output=True, timeout=config.TTS_TIMEOUT
        ).returncode != 0:
            return None
        if subprocess.run(
            ["afconvert", aiff, wav, "-f", "WAVE", "-d", "LEI16"],
            capture_output=True,
            timeout=config.TTS_TIMEOUT,
        ).returncode != 0:
            return None
    except Exception:
        return None
    finally:
        try:
            os.unlink(aiff)
        except OSError:
            pass
    return _read_and_unlink(wav)


def synthesize(text: str) -> bytes | None:
    text = (text or "").strip()[:600]
    if not text:
        return None
    t0 = time.perf_counter()
    wav: bytes | None = None
    engine = "say"
    if config.TTS_ENGINE in ("piper", "auto"):
        wav = _piper_wav(text)
        engine = "piper"
    if not wav:
        wav = _say_wav(text)  # explicit say, or piper fallback
        engine = "say"
    log.info(
        "tts engine=%s chars=%d %.0fms ok=%s",
        engine,
        len(text),
        (time.perf_counter() - t0) * 1000,
        bool(wav),
    )
    return wav

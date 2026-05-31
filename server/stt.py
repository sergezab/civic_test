"""Speech-to-text via faster-whisper. Fallback for browsers without the
Web Speech API (Safari/Firefox). Model loads lazily on first use."""

from __future__ import annotations

import os
import tempfile
import threading
import time

import config
from logutil import log

_model = None
_model_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel

                _model = WhisperModel(
                    config.WHISPER_MODEL,
                    device=config.WHISPER_DEVICE,
                    compute_type=config.WHISPER_COMPUTE,
                )
    return _model


class SttEngine:
    """Speech-to-text service with a lazy singleton Whisper model."""

    def __init__(self, max_concurrency: int | None = None) -> None:
        self._semaphore = threading.BoundedSemaphore(
            max(1, max_concurrency or config.STT_CONCURRENCY)
        )

    def transcribe(self, audio_bytes: bytes, suffix: str = ".webm") -> str:
        fd, path = tempfile.mkstemp(suffix=suffix)
        os.write(fd, audio_bytes)
        os.close(fd)
        try:
            t0 = time.perf_counter()
            with self._semaphore:
                model = _get_model()  # first call downloads/loads the model (slow)
                segments, _info = model.transcribe(path, language="en", vad_filter=True)
            text = " ".join(seg.text.strip() for seg in segments).strip()
            log.info(
                "stt transcribe %.0fms chars=%d bytes=%d",
                (time.perf_counter() - t0) * 1000,
                len(text),
                len(audio_bytes),
            )
            return text
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass


_DEFAULT_ENGINE = SttEngine()


def transcribe(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """Compatibility wrapper around the process-wide STT engine."""
    return _DEFAULT_ENGINE.transcribe(audio_bytes, suffix=suffix)

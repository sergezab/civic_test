"""Speech-to-text via faster-whisper. Fallback for browsers without the
Web Speech API (Safari/Firefox). Model loads lazily on first use."""

from __future__ import annotations

import os
import tempfile

import config

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(
            config.WHISPER_MODEL,
            device=config.WHISPER_DEVICE,
            compute_type=config.WHISPER_COMPUTE,
        )
    return _model


def transcribe(audio_bytes: bytes, suffix: str = ".webm") -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.write(fd, audio_bytes)
    os.close(fd)
    try:
        model = _get_model()
        segments, _info = model.transcribe(path, language="en", vad_filter=True)
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

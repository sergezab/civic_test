"""Civics Interview API — grades spoken answers, speaks feedback.

Phase 1: /health, /grade. (STT /stt and TTS /tts arrive in Phase 3.)
Run locally:  uvicorn app:app --host 0.0.0.0 --port 8088
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

import config
import grader
import stt as stt_mod
import tts as tts_mod
from logutil import log

app = FastAPI(title="Civics Interview API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── crude in-memory per-IP rate limit (single-process) ────────────
_hits: dict[str, deque[float]] = defaultdict(deque)


def _rate_ok(ip: str) -> bool:
    now = time.time()
    dq = _hits[ip]
    while dq and now - dq[0] > 60:
        dq.popleft()
    if len(dq) >= config.RATE_LIMIT_PER_MIN:
        return False
    dq.append(now)
    return True


class GradeRequest(BaseModel):
    question: str
    acceptedAnswers: list[str] = Field(default_factory=list)
    transcript: str = ""
    questionId: int | None = None


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "provider": config.GRADER_PROVIDER,
        "model": config.GRADER_MODEL,
    }


@app.post("/grade")
def grade_endpoint(req: GradeRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not _rate_ok(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "detail": "Too many requests; slow down a moment."},
        )

    transcript = (req.transcript or "")[: config.MAX_TRANSCRIPT_CHARS]
    accepted = [a for a in req.acceptedAnswers if a][: config.MAX_ACCEPTED_ANSWERS]
    if not accepted:
        accepted = ["(no accepted answer supplied)"]

    t0 = time.perf_counter()
    result = grader.grade(req.question, accepted, transcript)
    log.info(
        "/grade q=%s chars=%d total=%.0fms verdict=%s fallback=%s ip=%s",
        req.questionId,
        len(transcript),
        (time.perf_counter() - t0) * 1000,
        result["verdict"],
        result["fallback"],
        ip,
    )
    return result


class TTSRequest(BaseModel):
    text: str


@app.post("/tts")
def tts_endpoint(req: TTSRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not _rate_ok(ip):
        return JSONResponse(status_code=429, content={"error": "rate_limited"})
    t0 = time.perf_counter()
    wav = tts_mod.synthesize(req.text)
    log.info(
        "/tts chars=%d bytes=%d %.0fms",
        len(req.text or ""),
        len(wav) if wav else 0,
        (time.perf_counter() - t0) * 1000,
    )
    if not wav:
        return JSONResponse(status_code=503, content={"error": "tts_unavailable"})
    return Response(content=wav, media_type="audio/wav")


@app.post("/stt")
async def stt_endpoint(request: Request, file: UploadFile = File(...)):
    ip = request.client.host if request.client else "unknown"
    if not _rate_ok(ip):
        return JSONResponse(status_code=429, content={"error": "rate_limited"})
    data = await file.read()
    if not data:
        return JSONResponse(status_code=400, content={"error": "empty_audio"})
    if len(data) > config.MAX_AUDIO_BYTES:
        return JSONResponse(status_code=413, content={"error": "audio_too_large"})
    name = file.filename or "audio.webm"
    suffix = os.path.splitext(name)[1] or ".webm"
    t0 = time.perf_counter()
    try:
        text = stt_mod.transcribe(data, suffix=suffix)
    except Exception:
        log.warning("/stt failed after %.0fms", (time.perf_counter() - t0) * 1000)
        return JSONResponse(status_code=500, content={"error": "stt_failed"})
    log.info(
        "/stt bytes=%d chars=%d %.0fms",
        len(data),
        len(text),
        (time.perf_counter() - t0) * 1000,
    )
    return {"text": text}

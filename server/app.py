"""Civics Interview API — grades spoken answers, speaks feedback.

Phase 1: /health, /grade. (STT /stt and TTS /tts arrive in Phase 3.)
Run locally:  uvicorn app:app --host 0.0.0.0 --port 8088
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import config
import grader

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

    return grader.grade(req.question, accepted, transcript)

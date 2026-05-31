"""Civics Interview API — grades spoken answers, speaks feedback, and transcribes audio.

Run locally:  uvicorn app:app --host 0.0.0.0 --port 8088
"""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from typing import Literal

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
grader_service = grader.Grader()
tts_engine = tts_mod.TtsEngine()
stt_engine = stt_mod.SttEngine()

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type", "x-request-id"],
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


def _client_key(request: Request) -> str:
    if config.TRUST_PROXY_HEADERS:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",", maxsplit=1)[0].strip()
    return request.client.host if request.client else "unknown"


def _request_id(request: Request) -> str:
    value = getattr(request.state, "request_id", "")
    return value if isinstance(value, str) and value else "-"


async def _read_capped_upload(file: UploadFile, max_bytes: int) -> tuple[bytes, bool]:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(min(1024 * 1024, max_bytes + 1 - total))
        if not chunk:
            return b"".join(chunks), False
        total += len(chunk)
        if total > max_bytes:
            return b"", True
        chunks.append(chunk)


class GradeRequest(BaseModel):
    question: str = Field(min_length=1, max_length=400)
    acceptedAnswers: list[str] = Field(
        default_factory=list, max_length=config.MAX_ACCEPTED_ANSWERS
    )
    transcript: str = Field(default="", max_length=config.MAX_TRANSCRIPT_CHARS)
    questionId: int | None = Field(default=None, ge=1, le=100)


class HealthResponse(BaseModel):
    ok: bool
    provider: str
    model: str


class GradeResponse(BaseModel):
    verdict: Literal["correct", "partial", "incorrect"]
    feedback: str
    correctAnswer: str
    heard: str
    model: str | None
    fallback: bool


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)


class STTResponse(BaseModel):
    text: str


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    log.info(
        "request id=%s method=%s path=%s status=%d total=%.0fms ip=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - t0) * 1000,
        _client_key(request),
    )
    return response


@app.get("/health")
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        provider=config.GRADER_PROVIDER,
        model=config.GRADER_MODEL,
    )


@app.post("/grade", response_model=GradeResponse)
def grade_endpoint(req: GradeRequest, request: Request) -> GradeResponse | JSONResponse:
    ip = _client_key(request)
    if not _rate_ok(ip):
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "detail": "Too many requests; slow down a moment.",
            },
        )

    transcript = (req.transcript or "")[: config.MAX_TRANSCRIPT_CHARS]
    accepted = [a for a in req.acceptedAnswers if a][: config.MAX_ACCEPTED_ANSWERS]
    if not accepted:
        accepted = ["(no accepted answer supplied)"]

    t0 = time.perf_counter()
    result = grader_service.grade(req.question, accepted, transcript)
    log.info(
        "/grade id=%s q=%s chars=%d total=%.0fms verdict=%s fallback=%s ip=%s",
        _request_id(request),
        req.questionId,
        len(transcript),
        (time.perf_counter() - t0) * 1000,
        result["verdict"],
        result["fallback"],
        ip,
    )
    return GradeResponse(**result)


@app.post("/tts", response_model=None)
def tts_endpoint(req: TTSRequest, request: Request) -> Response | JSONResponse:
    ip = _client_key(request)
    if not _rate_ok(ip):
        return JSONResponse(status_code=429, content={"error": "rate_limited"})
    t0 = time.perf_counter()
    wav = tts_engine.synthesize(req.text)
    log.info(
        "/tts id=%s chars=%d bytes=%d total=%.0fms",
        _request_id(request),
        len(req.text or ""),
        len(wav) if wav else 0,
        (time.perf_counter() - t0) * 1000,
    )
    if not wav:
        return JSONResponse(status_code=503, content={"error": "tts_unavailable"})
    return Response(content=wav, media_type="audio/wav")


@app.post("/stt", response_model=STTResponse)
async def stt_endpoint(
    request: Request, file: UploadFile = File(...)
) -> STTResponse | JSONResponse:
    ip = _client_key(request)
    if not _rate_ok(ip):
        return JSONResponse(status_code=429, content={"error": "rate_limited"})
    if file.content_type and not file.content_type.startswith("audio/"):
        return JSONResponse(status_code=415, content={"error": "unsupported_audio_type"})
    data, too_large = await _read_capped_upload(file, config.MAX_AUDIO_BYTES)
    if too_large:
        return JSONResponse(status_code=413, content={"error": "audio_too_large"})
    if not data:
        return JSONResponse(status_code=400, content={"error": "empty_audio"})
    name = file.filename or "audio.webm"
    suffix = "." + name.rsplit(".", maxsplit=1)[1] if "." in name else ".webm"
    t0 = time.perf_counter()
    try:
        text = stt_engine.transcribe(data, suffix=suffix)
    except Exception:
        log.warning(
            "/stt id=%s failed total=%.0fms",
            _request_id(request),
            (time.perf_counter() - t0) * 1000,
        )
        return JSONResponse(status_code=500, content={"error": "stt_failed"})
    log.info(
        "/stt id=%s bytes=%d chars=%d total=%.0fms",
        _request_id(request),
        len(data),
        len(text),
        (time.perf_counter() - t0) * 1000,
    )
    return STTResponse(text=text)

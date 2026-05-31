"""HTTP endpoint tests via FastAPI's TestClient. The grader/STT/TTS layers are
monkeypatched, so these exercise routing, validation, and the rate limiter only —
no LLM, Whisper, or Piper calls."""

import app as appmod
import config
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    appmod._hits.clear()  # reset the per-IP rate-limit window between tests
    return TestClient(appmod.app)


def _grade_stub(verdict="correct"):
    return lambda q, a, t: {
        "verdict": verdict,
        "feedback": "ok",
        "correctAnswer": "x",
        "heard": t,
        "model": "m",
        "fallback": False,
    }


# ── /health ───────────────────────────────────────────────────────────────────
def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "provider" in body and "model" in body


def test_request_id_is_echoed(client):
    r = client.get("/health", headers={"x-request-id": "test-request-1"})
    assert r.status_code == 200
    assert r.headers["x-request-id"] == "test-request-1"


# ── /grade ────────────────────────────────────────────────────────────────────
def test_grade_returns_verdict(client, monkeypatch):
    monkeypatch.setattr(appmod.grader_service, "grade", _grade_stub("partial"))
    r = client.post(
        "/grade",
        json={"question": "Q", "acceptedAnswers": ["x"], "transcript": "x said", "questionId": 7},
    )
    assert r.status_code == 200
    assert r.json()["verdict"] == "partial"


def test_grade_supplies_placeholder_when_no_accepted(client, monkeypatch):
    captured = {}

    def spy(question, accepted, transcript):
        captured["accepted"] = accepted
        return _grade_stub()(question, accepted, transcript)

    monkeypatch.setattr(appmod.grader_service, "grade", spy)
    client.post("/grade", json={"question": "Q", "acceptedAnswers": [], "transcript": "hi"})
    assert captured["accepted"] == ["(no accepted answer supplied)"]


def test_grade_rate_limited_after_threshold(client, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MIN", 2)
    monkeypatch.setattr(appmod.grader_service, "grade", _grade_stub())
    payload = {"question": "Q", "acceptedAnswers": ["x"], "transcript": "x"}
    assert client.post("/grade", json=payload).status_code == 200
    assert client.post("/grade", json=payload).status_code == 200
    blocked = client.post("/grade", json=payload)
    assert blocked.status_code == 429
    assert blocked.json()["error"] == "rate_limited"


def test_grade_rejects_oversized_transcript(client):
    r = client.post(
        "/grade",
        json={
            "question": "Q",
            "acceptedAnswers": ["x"],
            "transcript": "x" * (config.MAX_TRANSCRIPT_CHARS + 1),
        },
    )
    assert r.status_code == 422


# ── /tts ──────────────────────────────────────────────────────────────────────
def test_tts_returns_wav(client, monkeypatch):
    monkeypatch.setattr(appmod.tts_engine, "synthesize", lambda text: b"RIFFxxxx")
    r = client.post("/tts", json={"text": "you passed"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    assert r.content == b"RIFFxxxx"


def test_tts_unavailable_returns_503(client, monkeypatch):
    monkeypatch.setattr(appmod.tts_engine, "synthesize", lambda text: None)
    r = client.post("/tts", json={"text": "you passed"})
    assert r.status_code == 503
    assert r.json()["error"] == "tts_unavailable"


# ── /stt ──────────────────────────────────────────────────────────────────────
def test_stt_rejects_empty_audio(client):
    r = client.post("/stt", files={"file": ("a.webm", b"", "audio/webm")})
    assert r.status_code == 400
    assert r.json()["error"] == "empty_audio"


def test_stt_rejects_oversized_audio(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_AUDIO_BYTES", 4)
    r = client.post("/stt", files={"file": ("a.webm", b"way too long", "audio/webm")})
    assert r.status_code == 413
    assert r.json()["error"] == "audio_too_large"


def test_stt_rejects_non_audio_upload(client):
    r = client.post("/stt", files={"file": ("a.txt", b"xxxx", "text/plain")})
    assert r.status_code == 415
    assert r.json()["error"] == "unsupported_audio_type"


def test_stt_transcribes(client, monkeypatch):
    monkeypatch.setattr(appmod.stt_engine, "transcribe", lambda data, suffix=".webm": "hello world")
    r = client.post("/stt", files={"file": ("a.webm", b"xxxx", "audio/webm")})
    assert r.status_code == 200
    assert r.json()["text"] == "hello world"


def test_stt_returns_500_on_transcribe_error(client, monkeypatch):
    def boom(data, suffix=".webm"):
        raise RuntimeError("whisper exploded")

    monkeypatch.setattr(appmod.stt_engine, "transcribe", boom)
    r = client.post("/stt", files={"file": ("a.webm", b"xxxx", "audio/webm")})
    assert r.status_code == 500
    assert r.json()["error"] == "stt_failed"
